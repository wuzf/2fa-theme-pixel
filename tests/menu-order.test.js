import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}) {
  const window = new Window({ url: "https://pixel.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.state.host.installAvailable = true;
  configure(mock);
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  // Group names and the entries of each group, in page order.
  const menu = () =>
    [...root.querySelectorAll(".pixel-management-group")].map((group) => [
      group.querySelector(".pixel-group-toggle").textContent,
      [...group.querySelector(".pixel-management-list").children].map(
        (node) => node.dataset.value || node.dataset.action,
      ),
    ]);
  const labels = () =>
    [...root.querySelectorAll(".pixel-management-list > *")].map(
      (node) => (node.querySelector("span") || node).textContent,
    );
  return { root, mock, menu, labels };
}

test("the menu reads like a game menu: inventory, items, system, more", (t) => {
  const { menu, labels } = fixture(t);
  assert.deepEqual(menu(), [
    ["Inventory", ["scan-import", "account-add", "import", "export", "backup"]],
    ["Items", ["tools", "quick-otp"]],
    [
      "System",
      [
        "scheme",
        "settings:security",
        "settings:sync",
        "settings:preferences",
        "settings:custom-code",
        "appearance",
        "settings:about",
      ],
    ],
    ["More", ["extension", "pwa-install", "logout"]],
  ]);
  const names = labels();
  assert.equal(new Set(names).size, names.length, names.join(" | "));
});

test("the group names are game words in Chinese too", (t) => {
  const { menu } = fixture(t, (mock) => {
    mock.state.preferences.resolvedLanguage = "zh-CN";
  });
  assert.deepEqual(
    menu().map(([name]) => name),
    ["背包", "道具", "系统", "更多"],
  );
});

test("signing in closes the menu when signed out", (t) => {
  const { menu } = fixture(t, (mock) => {
    mock.state.session.state = "logged-out";
  });
  assert.deepEqual(menu().at(-1)[1], ["extension", "pwa-install", "login"]);
});

test("actions the theme does not know yet still appear in the nearest group", (t) => {
  const { menu } = fixture(t, (mock) => {
    const listActions = mock.sdk.host.listActions;
    const extra = (actionId) => ({
      actionId,
      labelKey: actionId,
      requires: null,
      enabled: true,
      reason: null,
      request: { kind: "future" },
    });
    mock.sdk.host.listActions = () => [
      ...listActions(),
      extra("settings:future"),
      extra("future-global"),
    ];
  });
  const groups = Object.fromEntries(menu());
  // About stays right under the theme settings, signing out stays last.
  assert.deepEqual(groups.System.slice(-3), [
    "settings:future",
    "appearance",
    "settings:about",
  ]);
  assert.deepEqual(groups.More, [
    "extension",
    "pwa-install",
    "future-global",
    "logout",
  ]);
});
