// Checklist: activities to tick off, kept per space or across all of them. A side panel, opened by a
// tab-bar button (this same mod, given the layout prop { view: "button" }).
//
// The list lives in one file, ~/.config/herdr-app/data/checklist/items.json. Every copy of the mod
// (the panel, the button) watches that folder and reloads when it changes, so they stay in step.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import {
  spaces,
  theme,
  run,
  props,
  layout,
  shared,
  setShared,
  appHome,
  exec,
  readTextFile,
  writeTextFile,
  watchFolder,
} from "herdr";
import * as S from "./store.js";

// Every word the mod shows, in one place.
const TEXT = {
  title: "Checklist",
  thisSpace: "This space",
  allSpaces: "All",
  allSpacesCaption: "all spaces",
  placeholder: "Add an activity and press Enter",
  all: "All",
  open: "Open",
  done: "Done",
  emptyAll: "Nothing here yet. Add the first activity above.",
  emptyOpen: "Nothing left to do.",
  emptyDone: "Nothing done yet.",
  clear: "Clear done",
  clearConfirm: (n) => `Clear ${n} done? Click again`,
  summary: (open, done) => `${open} open · ${done} done`,
};

const PANEL = "checklist"; // this mod's block id in the side panel stack
const dir = () => `${appHome()}/data/checklist`;
const file = () => `${dir()}/items.json`;
const io = {
  read: () => readTextFile(file()),
  write: (text, expected) => writeTextFile(file(), text, expected),
};

const find = (n, id) =>
  !n ? null : n.id === id ? n : (n.children ?? []).reduce((hit, c) => hit ?? find(c, id), null);
const activeSpace = () => spaces().find((s) => s.active) ?? null;

const tickBox = (t, done, id, onClick) =>
  div()
    .id(id)
    .size(16)
    .flex_none()
    .mt(1)
    .rounded(4)
    .flex()
    .items_center()
    .justify_center()
    .cursor_pointer()
    .border(1)
    .border_color(done ? t.accent : t.input)
    .bg(done ? t.accent : t.background)
    .text_size(11)
    .text_color(t.background)
    .on_click(onClick)
    .child(done ? "✓" : "");

export default class Checklist extends View {
  init(_props, cx) {
    this.button = props()?.view === "button";
    this.data = S.empty();
    this.error = null;
    this.filter = "all";
    this.confirming = null; // the scope whose "Clear done" was clicked once
    this.scope = "space";
    try {
      if (localStorage.getItem("scope") === "all") this.scope = "all";
    } catch {}
    if (this.button) this.register();
    else {
      this.input = InputState.new({ placeholder: TEXT.placeholder });
      this.input.on("submit", (_e, cx) => this.addItem(cx));
    }
    cx.spawn(async (cx) => {
      await exec("mkdir", ["-p", dir()]);
      await this.load();
      cx.notify();
      for (;;) {
        await watchFolder(dir());
        await this.load();
        cx.notify();
      }
    });
  }

  // Herdr's tab bar restores each space's panel only from the "workspace.panels" list, so the panel
  // has to be in it. Only the button does this, and only once the layout and props are there (not
  // in `herdr-app check`, which has neither), so it can never wipe the list.
  register() {
    try {
      const inStack = (find(layout(), "panel-body")?.children ?? []).map((c) => c.id);
      if (!inStack.includes(PANEL)) return;
      const list = shared("workspace.panels") ?? ["files", "changes"];
      if (!list.includes(PANEL)) setShared("workspace.panels", [...list, PANEL]);
    } catch {}
  }

  async load() {
    try {
      this.data = S.parse(await readTextFile(file()));
      this.error = null;
    } catch (e) {
      this.error = `items.json can't be read: ${e?.message ?? e}`;
    }
  }

  change(fn, cx) {
    cx.spawn(async (cx) => {
      const r = await S.mutate(io, fn);
      if (r.ok) {
        this.data = r.data;
        this.error = null;
      } else this.error = r.error;
      cx.notify();
    });
  }

  scopeKey() {
    const space = activeSpace();
    return this.scope === "space" && space ? S.spaceKey(space) : null;
  }

  addItem(cx) {
    const text = this.input.value();
    const space = activeSpace();
    if (!text.trim() || !space) return;
    this.input.set_value("");
    this.confirming = null;
    if (this.filter === "done") this.filter = "all";
    const ref = S.spaceRef(space);
    this.change((d) => S.add(d, text, ref), cx);
  }

  clearDone(cx) {
    const key = this.scopeKey();
    const scope = key ?? "*";
    if (this.confirming !== scope) {
      this.confirming = scope;
      cx.notify();
      return;
    }
    this.confirming = null;
    this.change((d) => S.clearDone(d, key), cx);
  }

  segment(id, label, on, t, onClick) {
    return div()
      .id(id)
      .h(24)
      .px(9)
      .flex()
      .items_center()
      .rounded(6)
      .text_size(12)
      .cursor_pointer()
      .bg(on ? t.selected : t.background)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (e) => e.font_semibold())
      .hover((s) => s.bg(on ? t.selected : t.hover))
      .on_click(onClick)
      .child(label);
  }

  setScope(scope, cx) {
    this.scope = scope;
    this.confirming = null;
    try {
      localStorage.setItem("scope", scope);
    } catch {}
    cx.notify();
  }

  setFilter(filter, cx) {
    this.filter = filter;
    this.confirming = null;
    cx.notify();
  }

  header(t, space) {
    return h_flex()
      .h(38)
      .px(12)
      .gap(8)
      .items_center()
      .flex_none()
      .border_b(1)
      .border_color(t.border)
      .child(div().font_semibold().text_size(14).flex_none().child(TEXT.title))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(11)
          .text_color(t.dim)
          .child(this.scope === "space" ? (space?.name ?? "") : TEXT.allSpacesCaption),
      )
      .child(
        h_flex()
          .gap(2)
          .flex_none()
          .child(this.segment("scope-space", TEXT.thisSpace, this.scope === "space", t, (_e, cx) => this.setScope("space", cx)))
          .child(this.segment("scope-all", TEXT.allSpaces, this.scope === "all", t, (_e, cx) => this.setScope("all", cx))),
      );
  }

  row(t, item, showSpace) {
    const toggle = (_e, cx) => {
      this.confirming = null;
      this.change((d) => S.toggle(d, item.id), cx);
    };
    return h_flex()
      .id(`row-${item.id}`)
      .gap(8)
      .px(12)
      .py(7)
      .items_start()
      .hover((s) => s.bg(t.hover))
      .child(tickBox(t, item.done, `tick-${item.id}`, toggle))
      .child(
        v_flex()
          .id(`text-${item.id}`)
          .flex_1()
          .min_w(0)
          .gap(1)
          .cursor_pointer()
          .on_click(toggle)
          .child(
            div()
              .text_color(item.done ? t.muted : t.foreground)
              .when(item.done, (e) => e.line_through())
              .child(item.text),
          )
          .when(showSpace, (e) =>
            e.child(div().text_size(11).text_color(t.dim).truncate().child(item.space.name)),
          ),
      )
      .child(
        div()
          .id(`del-${item.id}`)
          .size(18)
          .flex_none()
          .rounded(4)
          .flex()
          .items_center()
          .justify_center()
          .cursor_pointer()
          .text_color(t.dim)
          .hover((s) => s.bg(t.selected))
          .on_click((_e, cx) => {
            this.confirming = null;
            this.change((d) => S.remove(d, item.id), cx);
          })
          .child("×"),
      );
  }

  renderButton(t) {
    const shell = find(layout(), "panel");
    const body = find(layout(), "panel-body");
    const on = Boolean(shell && !shell.hidden && body?.active === PANEL);
    const space = activeSpace();
    const open = space ? S.counts(this.data, S.spaceKey(space)).open : 0;
    return h_flex()
      .size_full()
      .pr(10)
      .items_center()
      .justify_end()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id(`panel-${PANEL}`)
          .h(26)
          .px(8)
          .gap(5)
          .flex_none()
          .items_center()
          .rounded(6)
          .text_size(12)
          .bg(on ? t.selected : t.chrome)
          .text_color(on ? t.foreground : t.muted)
          .hover((s) => s.bg(t.hover))
          .on_click(() => {
            if (on) run("layout.hide", { id: "panel" });
            else {
              run("layout.select", { stack: "panel-body", child: PANEL });
              run("layout.show", { id: "panel" });
            }
          })
          .child(
            div()
              .size(14)
              .flex_none()
              .rounded(3)
              .flex()
              .items_center()
              .justify_center()
              .border(1)
              .border_color(on ? t.foreground : t.muted)
              .text_size(10)
              .child("✓"),
          )
          .child(TEXT.title)
          .when(open > 0, (e) =>
            e.child(
              div()
                .h(16)
                .px(5)
                .rounded(8)
                .flex()
                .items_center()
                .text_size(10)
                .bg(t.accent)
                .text_color(t.background)
                .child(String(open)),
            ),
          ),
      );
  }

  render(_cx) {
    const t = theme();
    if (this.button) return this.renderButton(t);
    const space = activeSpace();
    const key = this.scopeKey();
    const c = S.counts(this.data, key);
    const items = S.view(this.data, { key, filter: this.filter });
    const empty = c.all === 0 ? TEXT.emptyAll : this.filter === "done" ? TEXT.emptyDone : TEXT.emptyOpen;
    return v_flex()
      .id("checklist")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .text_size(12.8)
      .text_color(t.foreground)
      .child(this.header(t, space))
      .child(
        div()
          .px(12)
          .py(10)
          .flex_none()
          .child(
            Input.new(this.input)
              .h(32)
              .px(10)
              .items_center()
              .rounded(7)
              .border(1)
              .border_color(t.input)
              .bg(t.background)
              .text_color(t.foreground),
          ),
      )
      .child(
        h_flex()
          .px(12)
          .pb(8)
          .gap(4)
          .flex_none()
          .child(this.segment("f-all", `${TEXT.all} ${c.all}`, this.filter === "all", t, (_e, cx) => this.setFilter("all", cx)))
          .child(this.segment("f-open", `${TEXT.open} ${c.open}`, this.filter === "open", t, (_e, cx) => this.setFilter("open", cx)))
          .child(this.segment("f-done", `${TEXT.done} ${c.done}`, this.filter === "done", t, (_e, cx) => this.setFilter("done", cx))),
      )
      .when(Boolean(this.error), (e) =>
        e.child(div().px(12).pb(8).text_size(11).text_color(t.blocked).child(String(this.error))),
      )
      .child(
        v_flex()
          .id("checklist-list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(items.map((item) => this.row(t, item, this.scope === "all")))
          .when(items.length === 0, (e) => e.child(div().px(12).py(20).text_color(t.dim).child(empty))),
      )
      .child(
        h_flex()
          .px(12)
          .py(8)
          .gap(8)
          .items_center()
          .flex_none()
          .border_t(1)
          .border_color(t.border)
          .text_size(11)
          .child(div().flex_1().text_color(t.dim).child(TEXT.summary(c.open, c.done)))
          .when(c.done > 0, (e) =>
            e.child(
              div()
                .id("clear-done")
                .h(22)
                .px(8)
                .flex()
                .items_center()
                .rounded(5)
                .cursor_pointer()
                .text_color(this.confirming === (key ?? "*") ? t.blocked : t.muted)
                .hover((s) => s.bg(t.hover))
                .on_click((_e, cx) => this.clearDone(cx))
                .child(this.confirming === (key ?? "*") ? TEXT.clearConfirm(c.done) : TEXT.clear),
            ),
          ),
      );
  }
}
