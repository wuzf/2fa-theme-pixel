import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const PREFIX = "pixel";

async function styles() {
  const dir = new URL("../src/styles/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".css"));
  const parts = await Promise.all(
    files.map((name) => readFile(new URL(name, dir), "utf8")),
  );
  return parts.join("\n");
}

test("opening a card's menu leaves the card itself unchanged", async () => {
  const css = await styles();
  // A card hover never applies while the pointer is on the menu, and only for a mouse.
  const hovers = [
    ...css.matchAll(
      new RegExp(`\\.${PREFIX}-card(?:\\.is-row)?:hover[^{,]*`, "g"),
    ),
  ].map((match) => match[0]);
  for (const selector of hovers)
    assert.match(
      selector,
      new RegExp(`:not\\(\\s*:has\\(\\.${PREFIX}-account-menu:hover\\)`),
      selector,
    );
  // Clicking the menu focuses it; only keyboard focus may restyle the card.
  assert.doesNotMatch(
    css,
    new RegExp(`\\.${PREFIX}-card(?::is\\([^)]*)?:focus-within`),
  );
  // No browser tap highlight over the whole card.
  assert.match(
    css,
    new RegExp(
      `\\.${PREFIX}-card\\s*\\{[^}]*-webkit-tap-highlight-color:\\s*transparent`,
    ),
  );
});
