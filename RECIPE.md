# Checklist

A checklist of activities for Herdr: a side panel, opened by a button in the tab bar, where you write down what you have to do and tick it off. Activities belong to one space or to all of them.

![Checklist](preview.png)

## What you see

It follows Herdr's theme. The **button** sits in the tab bar row, after the other panel buttons (Issues, Jira, GitLab): 26 px high, a 14 px box and the text "Checklist". The box shows a ✓ when nothing is left and, when the space in focus has open activities, their number on the accent colour ("9+" above nine). The count lives in the box, not beside the label, so the button keeps one width. It is highlighted (`selected`) while the checklist panel is open.

The **panel** lives in the side panel stack, with Files and Changes, on the `surface` background:

1. A 38 px header: "Checklist" in semibold, the name of the space in focus (or "all spaces") in a muted colour, and two segments on the right, "This space" and "All".
2. A 32 px text field, "Add an activity and press Enter".
3. Three filter segments with a count: "All n", "Open n", "Done n".
4. The list, scrollable. Each row has a 16 px box, the text (it wraps onto several lines) and a muted × on the right. Done: the box is filled with the accent colour and a ✓, the text is struck through and dimmed. In "All", the space's name shows small under the text. An empty list shows one short sentence.
5. A footer with "n open · n done" and, when there are done activities, "Clear done".

## How it behaves

- Enter in the field adds the activity to the **space in focus**, clears the field and, if the filter was "Done", switches it back to "All". Extra whitespace is collapsed, the text is at most 500 characters long, and empty text does nothing.
- Clicking the box or the text toggles done/open; the × deletes.
- Open activities first, oldest to newest; then the done ones, latest to oldest.
- "This space" filters by the space in focus; "All" shows everything. The choice is remembered (`localStorage`).
- "Clear done" asks for a second click ("Clear n done? Click again"); any other action cancels it. With "This space" it deletes only that space's done activities.
- A space is identified by `machine|folder`, not by its name: renaming it does not split its activities.

## Built from

`mods/checklist/` with `main.js` (the interface, GPUI), `store.js` (the data and its rules, importing nothing from Herdr) and `mod.json` with `{ "place": "none" }`, so Herdr does not dock the mod on its own. The same mod serves the panel and the button (`props.view === "button"`). No images: the box and the ✓ are a `div` and text.

The data lives in `appHome()/data/checklist/items.json`, `{ "version": 1, "items": [{ id, text, done, space: { key, name }, createdAt, doneAt }] }`. Each copy of the mod runs `mkdir -p` on the folder, reads the file and then sits in `for (;;) { await watchFolder(dir); reload; }`, so the panel and the button follow every change, even one made by hand.

Every change is "read now, apply, write only if the file has not changed" (`writeTextFile(path, text, expected)`), with up to 4 attempts on the new content. A file that is not valid JSON is **never** overwritten: the panel shows the error.

The button adds `checklist` to the shared `workspace.panels` list (the tab bar only reopens, per space, panels that are in it), and it does so only when the `checklist` block is already in the layout's stack.

Layout: the `checklist` block in the `panel-body` stack, and the `checklist-button` block (100 px) in the `tab-bar` row, with `props: { view: "button" }`.

## Watch out

- `herdr-app check` renders the mod with no props and with the real shared state, so the panel view must never write shared state. Only the button view registers the panel in `workspace.panels`, once, in `init`, and it must not wait to see the panel block in the layout: at `init` that snapshot can be one block behind, and the registration was silently skipped.
- A panel that is missing from `workspace.panels` is closed whenever you switch spaces; one that is in it is restored, open or closed, as you left it in each space.
- Saving a file reloads the copies in place **without** running `init` again. To get a fresh `init`, take the block out of the layout and put it back.
- The shared state (`shared.json`) is written with a delay: reading right after `setShared` can show the old value.
- Do not use `tasks.*` as a state prefix: keys from another mod with that name were left behind.
- Mods whose `"place"` is anything but `"none"` are docked into the layout on screen the first time Herdr sees the folder.

## Done when

- `npm test` passes: adding, ticking, deleting, "Clear done", counts, order and filters, `parse` rejecting broken JSON, and the write that redoes the change on the new content when the file changed in the meantime.
- `herdr-app check mods/checklist` passes and `herdr-app status` shows no error.
- With sample activities in the file, the panel shows the strike-through, the filters, the counts and the footer, and the button shows the number of open activities of the space in focus.
- Changing the file from outside updates the panel and the button without reloading anything.
