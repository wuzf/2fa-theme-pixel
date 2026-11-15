import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t) {
  const window = new Window({ url: "https://groups.test/" });
  const root = window.document.createElement("main");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return { root, mock };
}

test("smart grouping titles each service with its count; the flat list has none", (t) => {
  const h = fixture(t);
  h.mock.sdk.view.setMode("grouped");
  const titles = [...h.root.querySelectorAll(".pixel-group .pixel-group-title")]
    .filter((title) => !title.hidden)
    .map((title) => title.textContent);
  assert.ok(titles.length > 1);
  for (const title of titles) assert.match(title, / · \d+$/);
  const google = [...h.root.querySelectorAll(".pixel-group")].find((group) =>
    group
      .querySelector(".pixel-group-title")
      .textContent.startsWith("Google ·"),
  );
  assert.equal(
    google.querySelector(".pixel-group-title").textContent,
    `Google · ${google.querySelectorAll(".pixel-card").length}`,
  );
  h.mock.sdk.view.setMode("flat");
  assert.deepEqual(
    [...h.root.querySelectorAll(".pixel-group .pixel-group-title")]
      .filter((title) => !title.hidden)
      .map((title) => title.textContent),
    [],
  );
});
