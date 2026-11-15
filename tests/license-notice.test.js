import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { localText } from "../src/i18n.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

const PREFIX = "pixel";

function fixture(t, respond) {
  const window = new Window({ url: "https://license.test/" });
  const root = window.document.createElement("main");
  window.document.body.append(root);
  const requests = [];
  window.fetch = (url) => {
    requests.push(String(url));
    return respond(url);
  };
  const mock = createSyntheticSdk();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const link = root.querySelector(`.${PREFIX}-footer a`);
  const panel = () => root.querySelector(`.${PREFIX}-license-panel`);
  const click = (node, init = {}) => {
    const event = new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    node.dispatchEvent(event);
    return event;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { window, root, app, link, panel, click, settle, requests };
}

const ok = (text) => async () => ({ ok: true, text: async () => text });

test("the license link opens the notice inside the page, not in a new window", async (t) => {
  const h = fixture(t, ok("MIT License\nCopyright"));
  assert.equal(h.link.hasAttribute("target"), false);
  assert.ok(h.link.href.endsWith("/licenses/NOTICE.txt"));
  assert.equal(h.link.getAttribute("aria-expanded"), "false");
  assert.equal(h.link.getAttribute("aria-controls"), h.panel().id);
  assert.equal(h.panel().hidden, true);
  const event = h.click(h.link);
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.panel().hidden, false);
  assert.equal(h.link.getAttribute("aria-expanded"), "true");
  const text = h.panel().querySelector("pre");
  assert.equal(text.textContent, localText("en", "waiting"));
  assert.ok(h.window.document.activeElement === text);
  await h.settle();
  assert.equal(text.textContent, "MIT License\nCopyright");
  assert.deepEqual(h.requests, [h.link.href]);
  // Clicking the link again hides it; focus stays on the link.
  h.click(h.link);
  assert.equal(h.panel().hidden, true);
  assert.equal(h.link.getAttribute("aria-expanded"), "false");
  assert.ok(h.window.document.activeElement === h.link);
  // Reopening reuses the loaded text; the close button returns focus to the link.
  h.click(h.link);
  await h.settle();
  assert.equal(h.requests.length, 1);
  assert.equal(text.textContent, "MIT License\nCopyright");
  const close = h.panel().querySelector("button");
  assert.equal(close.textContent, "Close");
  close.click();
  assert.equal(h.panel().hidden, true);
  assert.ok(h.window.document.activeElement === h.link);
  // Escape inside the panel closes it too.
  h.click(h.link);
  text.dispatchEvent(
    new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(h.panel().hidden, true);
  assert.ok(h.window.document.activeElement === h.link);
});

test("modified clicks keep the browser's own link behavior", (t) => {
  const h = fixture(t, ok("text"));
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }])
    assert.equal(h.click(h.link, init).defaultPrevented, false);
  assert.equal(h.panel().hidden, true);
  assert.equal(h.requests.length, 0);
});

test("a failed load shows the failure text and the next opening retries", async (t) => {
  let fail = true;
  const h = fixture(t, async () =>
    fail ? { ok: false, status: 404 } : { ok: true, text: async () => "ok" },
  );
  h.click(h.link);
  await h.settle();
  const text = h.panel().querySelector("pre");
  assert.equal(text.textContent, localText("en", "failed"));
  h.click(h.link);
  fail = false;
  h.click(h.link);
  await h.settle();
  assert.equal(text.textContent, "ok");
  assert.equal(h.requests.length, 2);
});

test("a load that finishes after unmount writes nothing", async (t) => {
  let finish;
  const h = fixture(
    t,
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, text: async () => "late" });
      }),
  );
  h.click(h.link);
  await h.settle();
  const text = h.panel().querySelector("pre");
  h.app.unmount();
  finish();
  await h.settle();
  assert.equal(text.textContent, localText("en", "waiting"));
});
