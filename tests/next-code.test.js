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

// The next code has no visible label, as in the built-in view: the button shows
// only the code and says what it does in its tooltip and to screen readers.
test("the next-code button shows only the code, with a tooltip", async (t) => {
  const h = fixture(t);
  const next = h.card.querySelector('[data-action="next"]');
  assert.ok(next, "next-code button");
  const value = next.querySelector(".pixel-next-value");
  assert.ok(value, "next code");
  assert.ok(value.textContent.trim(), "next code text");
  assert.equal(next.textContent.trim(), value.textContent.trim());
  assert.ok(next.title, "tooltip");
  assert.ok(
    next.getAttribute("aria-label").startsWith(`${next.title} · `),
    next.getAttribute("aria-label"),
  );
});
