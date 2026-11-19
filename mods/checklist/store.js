// The checklist's data and its rules. Nothing from Herdr is imported here, so `node --test` runs it.

export const VERSION = 1;
export const MAX_TEXT = 500;

export const empty = () => ({ version: VERSION, items: [] });

const isItem = (i) =>
  i && typeof i.id === "string" && typeof i.text === "string" && i.space && typeof i.space.key === "string";

// Text of items.json to data. Absent or blank is an empty list. Anything that is not JSON throws:
// the caller must never write over a file it could not read.
export function parse(text) {
  if (text == null || !text.trim()) return empty();
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.items)) throw new Error("items.json has no list of items");
  return {
    version: VERSION,
    items: d.items.filter(isItem).map((i) => ({
      id: i.id,
      text: i.text,
      done: Boolean(i.done),
      space: { key: i.space.key, name: String(i.space.name ?? i.space.key) },
      createdAt: Number(i.createdAt) || 0,
      doneAt: i.done ? Number(i.doneAt) || 0 : null,
    })),
  };
}

export const serialize = (data) => JSON.stringify({ version: VERSION, items: data.items }, null, 2) + "\n";

// A space is told apart by its machine and folder, so a renamed space keeps its items.
export const spaceKey = (space) => `${space.machine ?? ""}|${space.folder || space.id}`;
export const spaceRef = (space) => ({ key: spaceKey(space), name: space.name });

export function newId(now = Date.now(), rand = Math.random()) {
  return now.toString(36) + rand.toString(36).slice(2, 6);
}

// Every change returns new data, or the very same object when there is nothing to change.
export function add(data, text, space, now = Date.now(), id = newId(now)) {
  const clean = String(text).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!clean) return data;
  return {
    ...data,
    items: [...data.items, { id, text: clean, done: false, space, createdAt: now, doneAt: null }],
  };
}

export function toggle(data, id, now = Date.now()) {
  if (!data.items.some((i) => i.id === id)) return data;
  return {
    ...data,
    items: data.items.map((i) => (i.id !== id ? i : { ...i, done: !i.done, doneAt: i.done ? null : now })),
  };
}

export function remove(data, id) {
  return data.items.some((i) => i.id === id) ? { ...data, items: data.items.filter((i) => i.id !== id) } : data;
}

// Done items go; given a space key, only that space's.
export function clearDone(data, key = null) {
  const gone = (i) => i.done && (key === null || i.space.key === key);
  return data.items.some(gone) ? { ...data, items: data.items.filter((i) => !gone(i)) } : data;
}

const inScope = (data, key) => (key === null ? data.items : data.items.filter((i) => i.space.key === key));

export function counts(data, key = null) {
  const own = inScope(data, key);
  const done = own.filter((i) => i.done).length;
  return { all: own.length, open: own.length - done, done };
}

// What the list shows: open items first, oldest first, then done ones, latest first.
export function view(data, { key = null, filter = "all" } = {}) {
  const own = inScope(data, key);
  const open = own.filter((i) => !i.done).sort((a, b) => a.createdAt - b.createdAt);
  const done = own.filter((i) => i.done).sort((a, b) => b.doneAt - a.doneAt);
  return filter === "open" ? open : filter === "done" ? done : [...open, ...done];
}

// One change applied to what is on disk right now, with the write refused if the file moved on in
// the meantime (that is what writeTextFile's `expected` is for): then it reads again and redoes the
// change on the fresh data. `io` is { read(): text|null, write(text, expected) }.
export async function mutate(io, change, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const raw = await io.read();
    let data;
    try {
      data = parse(raw);
    } catch (e) {
      return { ok: false, error: `items.json can't be read: ${e?.message ?? e}` };
    }
    const next = change(data);
    if (next === data) return { ok: true, data };
    try {
      await io.write(serialize(next), raw);
      return { ok: true, data: next };
    } catch {
      // Stale snapshot: another copy wrote first. Go round again on the new content.
    }
  }
  return { ok: false, error: "Couldn't save: items.json kept changing" };
}
