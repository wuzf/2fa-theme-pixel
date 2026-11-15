import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// happy-dom cannot hold :active, so the rule is checked as written; the live
// check held the mouse down on the card, its copy buttons and its menu.
test("pressing the card to copy presses it, its menu and other controls do not", async () => {
  const css = await readFile(
    new URL("../src/styles/inventory.css", import.meta.url),
    "utf8",
  );
  const pressed = [
    ...css.matchAll(/\.pixel-card:active:not\(([^{]*)\)\s*(::\w+\s*)?\{/g),
  ];
  assert.ok(pressed.length > 0, "a pressed card rule");
  const squash = (text) => text.replace(/\s+/g, " ");
  for (const [, condition] of pressed) {
    const text = squash(condition);
    // copyFromCard ignores the menu and every other control; the copy buttons copy.
    assert.match(text, /\.pixel-account-menu :active/);
    assert.match(
      text,
      /a, input, select, textarea, label, button:not\(\[data-action="copy"\], \[data-action="next"\]\) \):active/,
    );
  }
  assert.doesNotMatch(css, /\.pixel-card:has\(\s*:is\(\[data-action="copy"\]/);
  // The pressed rule comes after the card's own hover rule so it wins.
  const hover = css.lastIndexOf(".pixel-card:hover");
  assert.ok(pressed.at(-1).index > hover);
});
