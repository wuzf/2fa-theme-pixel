import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}, configureWindow = () => {}) {
  const window = new Window({ url: "https://pixel.test/" });
  configureWindow(window);
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.sdk.identity.mode = "live";
  configure(mock);
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  const group = (key) =>
    root.querySelector(`[data-action="management-group"][data-value="${key}"]`);
  const feature = (id) =>
    root.querySelector(`.pixel-feature[data-value="${id}"]`);
  const more = root.querySelector('[data-action="route"][data-value="more"]');
  const queue = root.querySelector(".pixel-queue-region");
  const navigate = (page) => {
    window.location.hash = "#/theme/pixel/" + page;
    window.dispatchEvent(new window.Event("hashchange"));
  };
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return { window, root, mock, app, group, feature, more, queue, navigate };
}

function visible(node) {
  return Boolean(node?.isConnected && !node.closest("[hidden]"));
}

function request(h, node, expected, returnFocus) {
  assert.ok(visible(node), "the action must be visible before it is clicked");
  assert.equal(node.disabled, false);
  const before = h.mock.calls.length;
  node.click();
  assert.equal(h.mock.calls.length, before + 1);
  assert.equal(h.mock.calls.at(-1).method, "host.open");
  assert.deepEqual(h.mock.calls.at(-1).value.request, expected);
  assert.ok(
    h.mock.calls.at(-1).value.options.returnFocus === returnFocus,
    "host flow must retain its expected return-focus element",
  );
}

function pending(operationId = "queued-1") {
  return {
    operationId,
    name: "Synthetic pending account",
    status: "failed",
    canEdit: true,
    canRetry: true,
    canCancel: true,
    claimed: false,
  };
}

test("normal management excludes standalone refresh and internal state actions while retaining business functions", (t) => {
  const h = fixture(t);
  h.navigate("more");
  assert.equal(
    h.root.querySelector('.pixel-management-list [data-action="refresh"]'),
    null,
  );
  for (const id of [
    "recovery",
    "hidden-accounts",
    "offline-queue",
    "offline-queue-status-retry",
    "account-edit",
    "offline-queue-edit",
    "offline-queue-retry",
    "offline-queue-cancel",
  ])
    assert.equal(h.feature(id), null, id);
  for (const id of [
    "account-add",
    "scan-import",
    "import",
    "export",
    "backup",
    "tools",
    "settings:security",
    "settings:preferences",
    "settings:sync",
    "settings:custom-code",
    "settings:about",
    "appearance",
    "extension",
    "quick-otp",
  ])
    assert.ok(h.feature(id), id);
  // The host's About page sits with the other settings.
  assert.ok(
    h.feature("settings:about").closest(".pixel-management-group") ===
      h.group("settings").closest(".pixel-management-group"),
  );
  // Adding by hand is rare, so it lives with the other ways to bring accounts in.
  assert.ok(
    h.feature("account-add").closest(".pixel-management-group") ===
      h.group("data").closest(".pixel-management-group"),
  );
  request(
    h,
    h.feature("account-add"),
    { kind: "account-add" },
    h.group("data"),
  );
  assert.equal(h.queue.hidden, true);
  assert.equal(h.root.querySelector('[data-state="hidden"]'), null);
  request(h, h.feature("import"), { kind: "import" }, h.group("data"));
});

test("unchanged action descriptors follow all three session states and retain unconfirmed logout", (t) => {
  const h = fixture(t);
  const descriptors = JSON.stringify(h.mock.sdk.host.listActions());
  h.navigate("more");
  h.group("application").click();
  for (const state of [
    "authenticated",
    "unconfirmed",
    "logged-out",
    "authenticated",
  ]) {
    h.mock.state.session.state = state;
    h.mock.emit();
    const shown = state === "logged-out" ? "login" : "logout";
    const absent = shown === "login" ? "logout" : "login";
    assert.equal(h.feature(absent), null, `${state}: ${absent}`);
    request(h, h.feature(shown), { kind: shown }, h.group("application"));
    assert.equal(JSON.stringify(h.mock.sdk.host.listActions()), descriptors);
    if (state === "unconfirmed") {
      const login = h.root.querySelector('[data-state="session"]');
      request(h, login, { kind: "login" }, h.more);
    }
  }
});

test("session action removal restores its management group without changing descriptors", (t) => {
  const h = fixture(t);
  h.navigate("more");
  h.group("application").click();
  h.feature("logout").focus();
  h.mock.state.session.state = "logged-out";
  h.mock.emit();
  assert.ok(
    h.window.document.activeElement === h.group("application"),
    "focus must remain at the expected element",
  );
  h.feature("login").focus();
  h.mock.state.session.state = "authenticated";
  h.mock.emit();
  assert.ok(
    h.window.document.activeElement === h.group("application"),
    "focus must remain at the expected element",
  );
  assert.ok(visible(h.window.document.activeElement));
});

test("PWA visibility follows strict snapshot availability and descriptor enabled independently", (t) => {
  const h = fixture(t);
  const descriptor = h.mock.sdk.host
    .listActions()
    .find((item) => item.actionId === "pwa-install");
  const descriptors = JSON.stringify(h.mock.sdk.host.listActions());
  h.navigate("more");
  h.group("application").click();
  for (const available of [undefined, false, "true", 1]) {
    h.mock.state.host.installAvailable = available;
    h.mock.emit();
    assert.equal(h.feature("pwa-install"), null);
  }
  h.mock.state.host.installAvailable = true;
  h.mock.emit();
  request(
    h,
    h.feature("pwa-install"),
    { kind: "pwa-install" },
    h.group("application"),
  );
  h.feature("pwa-install").focus();
  h.mock.state.host.installAvailable = false;
  h.mock.emit();
  assert.equal(h.feature("pwa-install"), null);
  assert.ok(
    h.window.document.activeElement === h.group("application"),
    "focus must remain at the expected element",
  );
  assert.equal(JSON.stringify(h.mock.sdk.host.listActions()), descriptors);
  h.mock.state.host.installAvailable = true;
  descriptor.enabled = false;
  h.mock.emit();
  assert.equal(h.feature("pwa-install"), null);
  descriptor.enabled = true;
  h.mock.emit();
  request(
    h,
    h.feature("pwa-install"),
    { kind: "pwa-install" },
    h.group("application"),
  );
});

for (const change of ["session", "installation"])
  test(`removing ${change} management entry never steals host dialog focus`, (t) => {
    const h = fixture(t, (mock) => {
      mock.state.host.installAvailable = true;
    });
    h.navigate("more");
    h.group("application").click();
    const source = h.feature(change === "session" ? "logout" : "pwa-install");
    source.focus();
    let focusCalls = 0;
    h.group("application").addEventListener("focus", () => focusCalls++);
    h.more.addEventListener("focus", () => focusCalls++);
    h.mock.state.host.dialogOpen = true;
    if (change === "session") h.mock.state.session.state = "logged-out";
    else h.mock.state.host.installAvailable = false;
    h.mock.emit();
    assert.equal(source.isConnected, false);
    assert.equal(focusCalls, 0);
    const hostInput = h.window.document.createElement("input");
    h.window.document.body.append(hostInput);
    hostInput.focus();
    h.mock.emit();
    assert.ok(
      h.window.document.activeElement === hostInput,
      "focus must remain at the expected element",
    );
  });

test("quick OTP uses its action label and request; safe mode stays out of the menu", (t) => {
  const translated = [];
  const h = fixture(t, (mock) => {
    const translate = mock.sdk.i18n.t;
    mock.sdk.i18n.t = (key, params) => {
      translated.push(key);
      if (key === "quickOtpTitle") return "Generate verification code";
      return translate(key, params);
    };
  });
  h.navigate("more");
  // Safe mode is offered by the host's error bar, not the menu.
  assert.equal(h.feature("recovery") === null, true);
  // Generating a code from a key is a tool, so it sits in the tools group.
  for (const [id, label, key, group] of [
    ["quick-otp", "Generate verification code", "quickOtpTitle", "tools"],
  ]) {
    if (h.group(group).getAttribute("aria-expanded") !== "true")
      h.group(group).click();
    assert.equal(h.feature(id).querySelector("span").textContent, label);
    assert.ok(translated.includes(key));
    request(h, h.feature(id), { kind: id }, h.group(group));
  }
  assert.equal(
    h.mock.sdk.host.listActions().find((item) => item.actionId === "recovery")
      .labelKey,
    "appearanceSafeMode",
  );
  assert.equal(
    h.mock.sdk.host.listActions().find((item) => item.actionId === "quick-otp")
      .labelKey,
    "appTitle",
  );
});

for (const aggregatesEnabled of [true, false])
  test(`exact aggregation (${aggregatesEnabled}) preserves unknown global requests and excludes contextual actions`, (t) => {
    const h = fixture(t, (mock) => {
      const actions = mock.sdk.host.listActions();
      for (const id of ["tools", "settings:sync"])
        actions.find((item) => item.actionId === id).enabled =
          aggregatesEnabled;
      for (const id of [
        "tool:future",
        "sync-provider:future",
        "hidden-accounts:future",
        "offline-queue:future",
      ])
        actions.push({
          actionId: id,
          labelKey: id,
          requires: null,
          enabled: true,
          request: { kind: "future", feature: id },
        });
      for (const requires of ["account", "operationId"])
        actions.push({
          actionId: "future:" + requires,
          labelKey: requires,
          requires,
          enabled: true,
          request: { kind: "future" },
        });
    });
    h.navigate("more");
    // An unknown tool or sync target joins its family; anything else "More".
    for (const [id, key] of [
      ["tool:future", "tools"],
      ["sync-provider:future", "settings"],
      ["hidden-accounts:future", "application"],
      ["offline-queue:future", "application"],
    ]) {
      if (h.group(key).getAttribute("aria-expanded") !== "true")
        h.group(key).click();
      request(h, h.feature(id), { kind: "future", feature: id }, h.group(key));
    }
    for (const id of ["future:account", "future:operationId"])
      assert.equal(h.feature(id), null);
    for (const [key, ids] of [
      [
        "tools",
        [
          "tool:qr-decode",
          "tool:qr-generate",
          "tool:base32",
          "tool:timestamp",
          "tool:key-check",
          "tool:key-generate",
        ],
      ],
      [
        "settings",
        [
          "sync-provider:webdav",
          "sync-provider:s3",
          "sync-provider:onedrive",
          "sync-provider:gdrive",
        ],
      ],
    ]) {
      h.group(key).click();
      for (const id of ids) {
        if (aggregatesEnabled) assert.equal(h.feature(id), null);
        else
          request(
            h,
            h.feature(id),
            h.mock.sdk.host.listActions().find((item) => item.actionId === id)
              .request,
            h.group(key),
          );
      }
    }
  });

test("hidden-account state appears only when needed and remains callable after resolution", (t) => {
  const h = fixture(t);
  for (const count of [2, 0, 1]) {
    h.mock.state.library.hidden.count = count;
    h.mock.emit();
    const node = h.root.querySelector('[data-state="hidden"]');
    assert.equal(h.feature("hidden-accounts"), null);
    if (!count) assert.equal(node, null);
    else request(h, node, { kind: "hidden-accounts" }, h.more);
  }
});

for (const state of ["operations", "unavailable", "authRequired"])
  test(`${state} queue exposes contextual controls, correct requests and a stable return target`, (t) => {
    const h = fixture(t, (mock) => {
      if (state === "operations") mock.state.queue.operations = [pending()];
      else mock.state.queue[state] = true;
    });
    assert.ok(visible(h.queue));
    request(
      h,
      h.queue.querySelector('[data-value="offline-queue"]'),
      { kind: "offline-queue" },
      h.more,
    );
    const retry = h.queue.querySelector(
      '[data-value="offline-queue-status-retry"]',
    );
    assert.equal(visible(retry), state === "unavailable");
    if (state === "unavailable")
      request(h, retry, { kind: "offline-queue-status-retry" }, h.more);
    if (state === "operations") {
      for (const kind of [
        "offline-queue-edit",
        "offline-queue-retry",
        "offline-queue-cancel",
      ])
        request(
          h,
          h.queue.querySelector(`[data-value="${kind}"]`),
          { kind, operationId: "queued-1" },
          h.more,
        );
      h.mock.state.queue.operations[0].claimed = true;
      h.mock.emit();
      for (const node of h.queue.querySelectorAll('[data-action="queue"]'))
        assert.equal(node.disabled, true);
    }
    h.mock.state.queue = {
      operations: [],
      busy: false,
      unavailable: false,
      authRequired: false,
    };
    h.mock.emit();
    assert.equal(h.queue.hidden, true);
    for (const id of ["offline-queue", "offline-queue-status-retry"])
      assert.equal(h.feature(id), null);
  });

const removals = [
  {
    name: "hidden-account state",
    setup(mock) {
      mock.state.library.hidden.count = 1;
    },
    select(h) {
      return h.root.querySelector('[data-state="hidden"]');
    },
    remove(mock) {
      mock.state.library.hidden.count = 0;
    },
  },
  {
    name: "whole queue",
    setup(mock) {
      mock.state.queue.unavailable = true;
    },
    select(h) {
      return h.queue.querySelector('[data-value="offline-queue-status-retry"]');
    },
    remove(mock) {
      mock.state.queue.unavailable = false;
    },
  },
  {
    name: "queue retry while queue remains",
    setup(mock) {
      mock.state.queue.unavailable = true;
      mock.state.queue.authRequired = true;
    },
    select(h) {
      return h.queue.querySelector('[data-value="offline-queue-status-retry"]');
    },
    remove(mock) {
      mock.state.queue.unavailable = false;
    },
  },
  {
    name: "one queue row",
    setup(mock) {
      mock.state.queue.operations = [pending(), pending("queued-2")];
    },
    select(h) {
      return h.queue.querySelector(
        '[data-value="offline-queue-edit"][data-operation="queued-1"]',
      );
    },
    remove(mock) {
      mock.state.queue.operations.shift();
    },
  },
  {
    name: "one queue operation button",
    setup(mock) {
      mock.state.queue.operations = [pending()];
    },
    select(h) {
      return h.queue.querySelector('[data-value="offline-queue-retry"]');
    },
    remove(mock) {
      mock.state.queue.operations[0].canRetry = false;
    },
  },
];

for (const removal of removals)
  for (const dialogOpen of [false, true])
    test(`${removal.name} disappearing ${dialogOpen ? "respects host dialog focus" : "returns focus to management"}`, (t) => {
      const h = fixture(t, removal.setup);
      const node = removal.select(h);
      assert.ok(visible(node));
      node.focus();
      assert.ok(
        h.window.document.activeElement === node,
        "focus must remain at the expected element",
      );
      const calls = [];
      const focus = h.more.focus.bind(h.more);
      h.more.focus = (options) => {
        calls.push(options);
        focus(options);
      };
      h.mock.state.host.dialogOpen = dialogOpen;
      removal.remove(h.mock);
      h.mock.emit();
      assert.equal(visible(node), false);
      if (dialogOpen) {
        assert.deepEqual(calls, []);
        const hostInput = h.window.document.createElement("input");
        h.window.document.body.append(hostInput);
        hostInput.focus();
        h.mock.emit();
        assert.ok(
          h.window.document.activeElement === hostInput,
          "focus must remain at the expected element",
        );
      } else {
        assert.ok(
          h.window.document.activeElement === h.more,
          "focus must remain at the expected element",
        );
        assert.deepEqual(calls, [{ preventScroll: true }]);
        assert.ok(visible(h.more));
      }
      h.mock.state.host.dialogOpen = false;
      removal.setup(h.mock);
      h.mock.emit();
      const reopened = removal.select(h);
      const before = h.mock.calls.length;
      reopened.click();
      assert.equal(h.mock.calls.length, before + 1);
      assert.equal(h.mock.calls.at(-1).method, "host.open");
      assert.ok(
        h.mock.calls.at(-1).value.options.returnFocus === h.more,
        "state flow must return focus to management",
      );
    });

test("management and account-menu host calls preserve their existing return-focus contracts", (t) => {
  const h = fixture(t);
  h.navigate("more");
  request(h, h.feature("import"), { kind: "import" }, h.group("data"));
  h.navigate("accounts");
  const card = h.root.querySelector('[data-account="google"]');
  const trigger = card.querySelector('[data-action="menu"]');
  trigger.click();
  const edit = card.querySelector('[data-action="edit"]');
  request(
    h,
    edit,
    { kind: "account-edit", account: h.mock.state.library.accounts[0].ref },
    trigger,
  );
});

test("failed reads retain status and empty-state retry without reintroducing management refresh", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.library.refreshState = "error";
  });
  const statusRetry = h.root.querySelector('[data-state="refresh-error"]');
  assert.ok(visible(statusRetry));
  statusRetry.click();
  assert.equal(h.mock.calls.at(-1).method, "accounts.refresh");
  h.mock.state.library.accounts = [];
  h.mock.state.library.state = "error";
  h.mock.emit();
  const emptyRetry = h.root.querySelector(
    '.pixel-empty-state [data-action="refresh"]',
  );
  assert.ok(visible(emptyRetry));
  emptyRetry.click();
  assert.equal(
    h.mock.calls.filter((call) => call.method === "accounts.refresh").length,
    2,
  );
  h.navigate("more");
  assert.equal(
    h.root.querySelector('.pixel-management-list [data-action="refresh"]'),
    null,
  );
});
