import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The pixel check measured the glyph 6.5px right and 2.5px low of the button centre.
test("the search glyph leaves room for its handle so the whole glyph is centred", async () => {
  const css = await readFile(
    new URL("../src/styles/inventory.css", import.meta.url),
    "utf8",
  );
  const at = css.indexOf(".pixel-theme .pixel-bar-icon.is-search {");
  const rule = css.slice(at, css.indexOf("}", at));
  // 20px lens, handle squares reaching 9px further right and down.
  assert.match(rule, /width: 14px;/);
  assert.match(rule, /border: 3px solid currentColor;/);
  assert.match(rule, /margin: 0 9px 9px 0;/);
});
