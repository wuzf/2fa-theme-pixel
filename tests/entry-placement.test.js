import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

// Host entries this theme keeps in its header; everything else lives in Manage.
const HEADER_HOST = [];

function fixture(t) {
  const window = new Window({ url: "https://entry-placement.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  if (mock.sdk.identity) mock.sdk.identity.mode = "live";
  mock.emit?.();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings: {} },
    signal: new AbortController().signal,
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return root;
}

test("the header keeps only everyday entries; adding and every import or export sit in Manage > Data", (t) => {
  const root = fixture(t);
  assert.deepEqual(
    [...root.querySelectorAll('header [data-action="host"]')].map(
      (node) => node.dataset.value,
    ),
    HEADER_HOST,
  );
  for (const id of [
    "account-add",
    "scan-import",
    "import",
    "export",
    "backup",
  ]) {
    const node = root.querySelector(
      `[class*="management-group"] [data-action="host"][data-value="${id}"]`,
    );
    assert.ok(node, id);
    const group = node.closest('[class*="management-group"]');
    const key =
      group.dataset.group ||
      group.querySelector('[data-action="management-group"]')?.dataset.value;
    assert.equal(key, "data", id);
  }
});
