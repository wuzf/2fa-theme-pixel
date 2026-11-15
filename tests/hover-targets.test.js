import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const PREFIX = "pixel";
const dir = new URL("../src/styles/", import.meta.url);

// Style rules with their declarations and the at-rules around them, from plain CSS text.
function rules(css) {
  const out = [];
  const stack = [];
  let start = 0;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const squash = (part) => part.replace(/\s+/g, " ").trim();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      stack.push({ prelude: squash(text.slice(start, i)), body: i + 1 });
      start = i + 1;
    } else if (text[i] === "}") {
      const rule = stack.pop();
      if (rule && !rule.prelude.startsWith("@"))
        out.push({
          prelude: rule.prelude,
          body: squash(text.slice(rule.body, i)),
          within: stack.map((parent) => parent.prelude),
        });
      start = i + 1;
    } else if (text[i] === ";") start = i + 1;
  }
  return out;
}
async function styles() {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".css"));
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, dir), "utf8")),
  );
  return sources.flatMap(rules);
}
const inside = (rule, hover) =>
  rule.within.some((at) =>
    new RegExp(`^@media[^{]*\\(\\s*hover\\s*:\\s*${hover}\\s*\\)`).test(at),
  );

// A click anywhere on the card copies the current code, except on its menu and
// its other buttons. "Next" copies the next code, so pointing at it lights that
// button alone instead of the card as well.
test("the card lights up only where a click copies the current code", async () => {
  const cards = (await styles()).filter((rule) =>
    rule.prelude.includes(`.${PREFIX}-card:hover`),
  );
  assert.ok(cards.length > 0, "a card hover rule");
  for (const { prelude } of cards) {
    assert.ok(
      prelude.includes(`:not(:has(.${PREFIX}-account-menu:hover))`),
      prelude,
    );
    assert.match(
      prelude,
      /:not\( ?:has\(button:not\(\[data-action="copy"\]\):hover\) ?\)/,
      prelude,
    );
  }
});

// The code copies what the rest of the lit card copies, so inside a card it has
// no second highlight, under a mouse or a finger.
test("the code button adds no highlight of its own inside a card", async () => {
  const all = await styles();
  for (const [media, state] of [
    ["hover", ":hover"],
    ["none", ":active"],
  ]) {
    const own = all.filter(
      (rule) =>
        inside(rule, media) &&
        rule.prelude.includes(".pixel-account-grid ") &&
        rule.prelude.endsWith(`.${PREFIX}-copy-code:not(:disabled)${state}`),
    );
    assert.equal(own.length, 1, `card code ${state}`);
    assert.match(own[0].body, /background: transparent/);
  }
});

// With the card unlit, "next" is all that lights up, so its code turns with its label.
test("the next code lights up with its label", async () => {
  const all = await styles();
  for (const [media, state] of [
    ["hover", ":hover"],
    ["none", ":active"],
  ]) {
    const lit = all.find(
      (rule) =>
        inside(rule, media) &&
        rule.prelude.includes(
          `.${PREFIX}-otp-next:not(:disabled)${state} .${PREFIX}-next-value`,
        ),
    );
    assert.ok(lit, `next code ${state}`);
    assert.match(lit.body, /color: var\(--pixel-green\)/);
  }
});
