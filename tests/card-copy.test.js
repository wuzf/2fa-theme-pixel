import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t) {
  const window = new Window({ url: "https://card-copy.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.emit();
  const controller = new AbortController();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings: {} },
    signal: controller.signal,
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const card = root.querySelector('article[data-account="google"]');
  assert.ok(card, "google card");
  const copies = () =>
    mock.calls
      .filter((call) => call.method === "otp.copy")
      .map((call) => call.value);
  return { root, window, mock, card, copies };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
// A part of the card that is neither a control nor inside its menu.
function plainPart(card) {
  return [...card.querySelectorAll("*")].find(
    (node) =>
      !node.closest("a, button, input, select, textarea, label") &&
      !node.querySelector("a, button, input, select, textarea, label") &&
      !node.closest("[hidden]") &&
      node.textContent.trim(),
  );
}

test("clicking anywhere on an account card copies its current code", async (t) => {
  const h = fixture(t);
  h.card.click();
  await flush();
  const part = plainPart(h.card);
  assert.ok(part, "card has a plain text part");
  part.click();
  await flush();
  assert.deepEqual(
    h.copies().map(({ accountId, slot }) => [accountId, slot]),
    [
      ["google", "current"],
      ["google", "current"],
    ],
  );
});

test("card controls keep their own actions instead of copying the current code", async (t) => {
  const h = fixture(t);
  h.card.querySelector('[data-action="menu"]').click();
  await flush();
  assert.deepEqual(h.copies(), []);
  const next = h.card.querySelector('[data-action="next"]');
  if (next && !next.disabled && !next.hidden) {
    next.click();
    await flush();
    assert.deepEqual(
      h.copies().map(({ slot }) => slot),
      ["next"],
    );
  }
});
