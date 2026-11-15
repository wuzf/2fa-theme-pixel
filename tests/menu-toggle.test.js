import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

const ROUTE = "pixel";

test("the header management button opens the management page and closes it again", async (t) => {
  const window = new Window({ url: "https://theme.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.sdk.identity.mode = "live";
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const menu = root.querySelector('[data-action="route"][data-value="more"]');
  assert.ok(menu, "header management button");
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  menu.click();
  assert.equal(window.location.hash, `#/theme/${ROUTE}/more`);
  assert.equal(menu.getAttribute("aria-expanded"), "true");
  menu.click();
  assert.equal(window.location.hash, `#/theme/${ROUTE}/accounts`);
  assert.equal(menu.getAttribute("aria-expanded"), "false");
});
