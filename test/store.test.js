import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../mods/checklist/store.js";

const A = { key: "|/work/a", name: "a" };
const B = { key: "|/work/b", name: "b" };
const seed = (...texts) => texts.reduce((d, t, i) => S.add(d, t, i % 2 ? B : A, 1000 + i, `id${i}`), S.empty());

test("parse: absent, blank and empty files are an empty list", () => {
  for (const text of [null, "", "  \n"]) assert.deepEqual(S.parse(text), S.empty());
});

test("parse: text that is not JSON throws, so it is never written over", () => {
  assert.throws(() => S.parse("{ nope"));
  assert.throws(() => S.parse('{"items": 3}'));
});

test("parse: keeps good items, drops malformed ones, clears doneAt on open items", () => {
  const text = JSON.stringify({
    items: [
      { id: "a", text: "ok", done: false, doneAt: 5, space: { key: "k", name: "n" }, createdAt: 1 },
      { id: "b", text: "no space" },
      { text: "no id", space: { key: "k" } },
    ],
  });
  const d = S.parse(text);
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].doneAt, null);
});

test("serialize and parse round-trip", () => {
  const d = S.toggle(seed("one", "two"), "id0", 2000);
  assert.deepEqual(S.parse(S.serialize(d)), d);
});

test("add: trims, collapses spaces, caps the length, ignores blanks", () => {
  const d = S.add(S.empty(), "  write   the\n test ", A, 1, "x");
  assert.equal(d.items[0].text, "write the test");
  assert.equal(S.add(S.empty(), "x".repeat(900), A, 1, "y").items[0].text.length, S.MAX_TEXT);
  const empty = S.empty();
  assert.equal(S.add(empty, "   ", A), empty);
});

test("changes do not touch the data they were given", () => {
  const d = seed("one");
  const snapshot = JSON.stringify(d);
  S.toggle(d, "id0", 5);
  S.remove(d, "id0");
  S.add(d, "two", A);
  S.clearDone(d);
  assert.equal(JSON.stringify(d), snapshot);
});

test("toggle sets and clears doneAt; an unknown id changes nothing", () => {
  const d = seed("one");
  const done = S.toggle(d, "id0", 7777);
  assert.deepEqual([done.items[0].done, done.items[0].doneAt], [true, 7777]);
  const open = S.toggle(done, "id0", 8888);
  assert.deepEqual([open.items[0].done, open.items[0].doneAt], [false, null]);
  assert.equal(S.toggle(d, "nope"), d);
});

test("remove drops one item; an unknown id changes nothing", () => {
  const d = seed("one", "two");
  assert.deepEqual(S.remove(d, "id0").items.map((i) => i.id), ["id1"]);
  assert.equal(S.remove(d, "nope"), d);
});

test("clearDone: all spaces, or only one", () => {
  let d = seed("a1", "b1", "a2"); // a, b, a
  d = S.toggle(S.toggle(S.toggle(d, "id0", 1), "id1", 2), "id2", 3);
  assert.equal(S.clearDone(d).items.length, 0);
  assert.deepEqual(S.clearDone(d, A.key).items.map((i) => i.id), ["id1"]);
  const open = seed("x");
  assert.equal(S.clearDone(open), open);
});

test("counts by space and overall", () => {
  const d = S.toggle(seed("a1", "b1", "a2"), "id0", 9);
  assert.deepEqual(S.counts(d, A.key), { all: 2, open: 1, done: 1 });
  assert.deepEqual(S.counts(d, B.key), { all: 1, open: 1, done: 0 });
  assert.deepEqual(S.counts(d), { all: 3, open: 2, done: 1 });
});

test("view: open first by age, then done by latest; filters and scope", () => {
  let d = seed("first", "second", "third", "fourth"); // a, b, a, b
  d = S.toggle(S.toggle(d, "id0", 50), "id2", 60);
  assert.deepEqual(S.view(d).map((i) => i.text), ["second", "fourth", "third", "first"]);
  assert.deepEqual(S.view(d, { filter: "open" }).map((i) => i.text), ["second", "fourth"]);
  assert.deepEqual(S.view(d, { filter: "done" }).map((i) => i.text), ["third", "first"]);
  assert.deepEqual(S.view(d, { key: A.key }).map((i) => i.text), ["third", "first"]);
  assert.deepEqual(S.view(d, { key: B.key, filter: "open" }).map((i) => i.text), ["second", "fourth"]);
});

test("spaceKey separates machines and survives a rename", () => {
  const local = { id: "s1", name: "x", folder: "/w", machine: null };
  assert.equal(S.spaceKey(local), S.spaceKey({ ...local, name: "renamed" }));
  assert.notEqual(S.spaceKey(local), S.spaceKey({ ...local, machine: "mac-mini" }));
  assert.equal(S.spaceKey({ id: "s9", name: "n", folder: "", machine: null }), "|s9");
});

// A fake disk with the same rule as writeTextFile: refuse when `expected` is not the current text.
const disk = (text = null, { staleOnce = false } = {}) => {
  const d = { text, writes: 0, stale: staleOnce };
  d.io = {
    read: async () => d.text,
    write: async (next, expected) => {
      if (d.stale) {
        d.stale = false;
        d.text = S.serialize(S.add(S.parse(d.text), "added by another copy", B, 1, "other"));
      }
      if (expected !== d.text) throw new Error("stale snapshot");
      d.text = next;
      d.writes++;
    },
  };
  return d;
};

test("mutate: creates the file the first time", async () => {
  const d = disk();
  const r = await S.mutate(d.io, (x) => S.add(x, "first", A, 1, "n1"));
  assert.equal(r.ok, true);
  assert.equal(S.parse(d.text).items[0].text, "first");
});

test("mutate: a stale write is redone on the fresh data, losing nothing", async () => {
  const d = disk(S.serialize(seed("kept")), { staleOnce: true });
  const r = await S.mutate(d.io, (x) => S.add(x, "mine", A, 5, "mine"));
  assert.equal(r.ok, true);
  assert.deepEqual(S.parse(d.text).items.map((i) => i.text).sort(), ["added by another copy", "kept", "mine"]);
});

test("mutate: a file that can't be read is left alone", async () => {
  const d = disk("{ broken");
  const r = await S.mutate(d.io, (x) => S.add(x, "lost", A));
  assert.equal(r.ok, false);
  assert.equal(d.text, "{ broken");
  assert.equal(d.writes, 0);
});

test("mutate: a change that changes nothing does not write", async () => {
  const d = disk(S.serialize(seed("x")));
  const r = await S.mutate(d.io, (x) => S.toggle(x, "nope"));
  assert.equal(r.ok, true);
  assert.equal(d.writes, 0);
});

test("mutate: gives up when the file never stops changing", async () => {
  const always = { read: async () => null, write: async () => { throw new Error("stale"); } };
  const r = await S.mutate(always, (x) => S.add(x, "t", A), 3);
  assert.equal(r.ok, false);
});
