import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { localText } from "../src/i18n.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

test("cached accounts are labelled as a local snapshot only after the refresh ends", async (t) => {
  const window = new Window({ url: "https://theme.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.sdk.identity.mode = "live";
  mock.state.preferences.resolvedLanguage = "en";
  mock.state.library.source = "local";
  mock.state.library.refreshState = "refreshing";
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const label = localText("en", "local");
  assert.ok(label);
  // Every load shows the cache first; naming it while it refreshes is just noise.
  assert.equal(root.textContent.includes(label), false);
  mock.state.library.refreshState = "idle";
  mock.emit();
  assert.equal(root.textContent.includes(label), true);
  // A failed refresh already says so and offers a retry; one notice is enough.
  mock.state.library.refreshState = "error";
  mock.emit();
  assert.equal(root.textContent.includes(label), false);
  assert.equal(root.textContent.includes(localText("en", "failed")), true);
  mock.state.library.source = "server";
  mock.state.library.refreshState = "idle";
  mock.emit();
  assert.equal(root.textContent.includes(label), false);
});

test("the clock warning appears only for a clock that was never checked", async (t) => {
  const window = new Window({ url: "https://theme.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.sdk.identity.mode = "live";
  mock.state.preferences.resolvedLanguage = "en";
  const warning = "Local clock may be inaccurate";
  const translate = mock.sdk.i18n.t;
  mock.sdk.i18n.t = (key, params) =>
    key === "clockWarningText"
      ? warning + "; OTP codes may be invalid."
      : translate(key, params);
  mock.state.clock.status = "cached";
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  // A cached offset comes from an earlier successful check.
  assert.equal(root.textContent.includes(warning), false);
  mock.state.clock.status = "local";
  mock.emit();
  assert.equal(root.textContent.includes(warning), true);
  mock.state.clock.status = "synced";
  mock.emit();
  assert.equal(root.textContent.includes(warning), false);
});
