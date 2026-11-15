import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}) {
  const window = new Window({ url: "https://pixel.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const timers = new Map();
  let time = 0,
    sequence = 0;
  window.setTimeout = (callback, delay = 0) => {
    const id = ++sequence;
    timers.set(id, { callback, due: time + delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  const advance = (milliseconds) => {
    const end = time + milliseconds;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, task]) => task.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      time = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  };
  const mock = createSyntheticSdk();
  configure(mock);
  mock.emit();
  const controller = new AbortController();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings: {} },
    signal: controller.signal,
  });
  const click = (selector) => {
    const node = root.querySelector(selector);
    assert.ok(node, selector);
    node.click();
    return node;
  };
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return {
    root,
    window,
    mock,
    app,
    controller,
    timers,
    advance,
    click,
    notice: root.querySelector(".pixel-notice"),
  };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const copySelector = '[data-account="google"] [data-action="copy"]';

test("copy toast is atomic and noninteractive, expires at four seconds and repeated copy renews its timer", async (t) => {
  const h = fixture(t);
  const copy = h.root.querySelector(copySelector);
  copy.focus();
  h.window.scrollTo = () => {
    throw new Error("Copy must never scroll the page");
  };
  h.click(copySelector);
  await flush();
  assert.equal(h.mock.calls.length, 1);
  assert.equal(h.mock.calls[0].method, "otp.copy");
  assert.equal(h.notice.textContent, "Copied");
  assert.equal(h.notice.dataset.kind, "success");
  assert.equal(h.notice.getAttribute("role"), "status");
  assert.equal(h.notice.getAttribute("aria-live"), "polite");
  assert.equal(h.notice.getAttribute("aria-atomic"), "true");
  assert.equal(h.notice.querySelector("button,a,input"), null);
  assert.equal(h.notice.textContent.includes("008421"), false);
  assert.equal(h.window.document.activeElement, copy);
  const oldTimeout = [...h.timers.values()][0].callback;
  h.advance(3000);
  h.click(copySelector);
  await flush();
  assert.equal(h.timers.size, 1);
  oldTimeout();
  assert.equal(h.notice.hidden, false);
  h.advance(3999);
  assert.equal(h.notice.hidden, false);
  h.advance(1);
  assert.equal(h.notice.hidden, true);
  assert.equal(h.notice.textContent, "");
  assert.equal(h.mock.calls.length, 2);
});

for (const failure of ["rejected", "promise-rejected"])
  test(`copy ${failure} remains truthful for eight seconds`, async (t) => {
    const h = fixture(t, (mock) => {
      mock.sdk.otp.copy = () =>
        failure === "rejected"
          ? Promise.resolve({ status: "rejected", reason: "clipboard-failed" })
          : Promise.reject(new Error("synthetic clipboard denial"));
    });
    h.click(copySelector);
    await flush();
    assert.equal(h.notice.dataset.kind, "error");
    assert.equal(
      h.notice.textContent,
      "The action could not be completed. Please retry.",
    );
    h.advance(7999);
    assert.equal(h.notice.hidden, false);
    h.advance(1);
    assert.equal(h.notice.hidden, true);
  });

test("partial HOTP copy toast expires without deleting the persistent recovery operation", async (t) => {
  const operation = {
    operationId: "pending-hotp",
    accountId: "hotp",
    type: "hotp",
    status: "settled",
    clipboard: "copied",
    reservation: "unknown",
    localCommit: "not-started",
    reconciliation: "not-needed",
    recovery: "reconcile",
  };
  const h = fixture(t, (mock) => {
    mock.state.host.operations = [operation];
    mock.sdk.otp.copy = () => Promise.resolve(operation);
  });
  h.click('[data-account="hotp"] [data-action="copy"]');
  await flush();
  assert.equal(h.notice.dataset.kind, "error");
  assert.match(h.notice.textContent, /Clipboard:/);
  assert.match(h.notice.textContent, /Reservation:/);
  const recover = h.root.querySelector('[data-action="reconcile"]');
  assert.ok(recover);
  h.advance(7999);
  assert.equal(h.notice.hidden, false);
  h.advance(1);
  assert.equal(h.notice.hidden, true);
  assert.equal(h.root.querySelector('[data-action="reconcile"]'), recover);
  assert.equal(h.root.querySelector(".pixel-operation-region").hidden, false);
  assert.equal(h.mock.state.host.operations.length, 1);
});

for (const boundary of ["route", "clear"])
  test(`${boundary} clears the current toast and rejects an older pending command notification`, async (t) => {
    let finish;
    const h = fixture(t);
    h.click(copySelector);
    await flush();
    assert.equal(h.timers.size, 1);
    h.mock.sdk.otp.copy = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    h.click(copySelector);
    h.click(
      boundary === "route"
        ? '[data-action="route"][data-value="more"]'
        : '[data-action="clear"]',
    );
    h.advance(0); // Drain the synthetic browser's queued hashchange event.
    assert.equal(h.notice.hidden, true);
    assert.equal(h.timers.size, 0);
    finish({ status: "settled", clipboard: "copied" });
    await flush();
    assert.equal(h.notice.hidden, true);
    assert.equal(h.timers.size, 0);
    if (boundary === "route")
      h.click('[data-action="route"][data-value="accounts"]');
    h.mock.sdk.otp.copy = () =>
      Promise.resolve({ status: "settled", clipboard: "copied" });
    h.click(copySelector);
    await flush();
    assert.equal(h.notice.hidden, false);
  });

for (const boundary of ["abort", "unmount"])
  test(`${boundary} cancels toast timing and prevents late results or old callbacks from reviving it`, async (t) => {
    let finish;
    const h = fixture(t);
    h.click(copySelector);
    await flush();
    const oldTimeout = [...h.timers.values()][0].callback;
    h.mock.sdk.otp.copy = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    h.click(copySelector);
    if (boundary === "abort") h.controller.abort();
    else h.app.unmount();
    assert.equal(h.timers.size, 0);
    assert.equal(h.root.querySelector(".pixel-theme"), null);
    finish({ status: "settled", clipboard: "copied" });
    await flush();
    oldTimeout();
    assert.equal(h.notice.hidden, true);
    assert.equal(h.timers.size, 0);
  });

test("toast CSS is centered in the viewport with no pointer capture or transformed containing ancestor", async (t) => {
  const h = fixture(t);
  for (const path of ["tokens", "components", "application"]) {
    const style = h.window.document.createElement("style");
    style.textContent = await readFile(
      new URL(`../src/styles/${path}.css`, import.meta.url),
      "utf8",
    );
    h.window.document.head.append(style);
  }
  h.click(copySelector);
  await flush();
  const style = h.window.getComputedStyle(h.notice);
  assert.equal(style.position, "fixed");
  assert.equal(style.zIndex, "100");
  assert.equal(style.pointerEvents, "none");
  assert.equal(style.minHeight, "44px");
  assert.equal(style.overflowWrap, "anywhere");
  assert.equal(style.width, "max-content");
  assert.match(style.maxWidth, /560px.*32px/);
  assert.equal(style.textAlign, "center");
  for (const width of [320, 390, 1440]) {
    h.window.happyDOM.setViewport({ width, height: 844 });
    for (const mode of ["light", "dark"]) {
      h.mock.state.preferences.resolvedTheme = mode;
      h.mock.emit();
      assert.equal(h.notice.hidden, false);
      assert.equal(h.notice.textContent, "Copied");
      const current = h.window.getComputedStyle(h.notice);
      assert.equal(current.position, "fixed");
      assert.equal(current.top, "50%");
      assert.equal(current.left, "50%");
      assert.equal(current.bottom, "auto");
      assert.equal(current.transform, "translate(-50%, -50%)");
      assert.equal(current.pointerEvents, "none");
    }
  }
  for (let node = h.notice.parentElement; node; node = node.parentElement) {
    const parentStyle = h.window.getComputedStyle(node);
    assert.ok(["", "none"].includes(parentStyle.transform));
    assert.ok(["", "none"].includes(parentStyle.filter));
    assert.ok(["", "none"].includes(parentStyle.contain));
  }
});

test("switching light and dark shows no notice; the page itself shows the change", async (t) => {
  const h = fixture(t);
  h.click('[data-action="scheme"]');
  await flush();
  assert.ok(h.mock.calls.some((call) => call.method === "preferences.set"));
  assert.equal(h.notice.hidden, true);
  assert.equal(h.notice.textContent, "");
});
