import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { languages, localText } from "../src/i18n.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}) {
  const window = new Window({ url: "https://pixel.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  configure(mock);
  mock.emit();
  const controller = new AbortController();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: {
      settings: {},
    },
    signal: controller.signal,
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const click = (selector) => {
    const node = root.querySelector(selector);
    assert.ok(node, selector);
    node.click();
    return node;
  };
  return { window, root, mock, app, controller, click };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

test("renders only service and account identity from SDK, preserving leading zeros", (t) => {
  const h = fixture(t);
  assert.equal(h.root.querySelectorAll("[data-account]").length, 6);
  assert.equal(
    h.root.querySelector('[data-account="google"] .pixel-account-name')
      .textContent,
    "Google",
  );
  assert.equal(
    h.root.querySelector('[data-account="google"] .pixel-account-address')
      .textContent,
    "design.team@example.invalid",
  );
  assert.equal(
    h.root.querySelector('[data-account="google"] .pixel-otp-value')
      .textContent,
    "008421",
  );
  assert.equal(
    h.root.querySelector('[data-account="empty"] .pixel-account-address')
      .hidden,
    true,
  );
});
test("copies current and next exact SDK tickets synchronously with one call each", (t) => {
  const h = fixture(t);
  h.click('[data-account="google"] [data-action="copy"]');
  assert.equal(h.mock.calls.length, 1);
  assert.equal(h.mock.calls[0].method, "otp.copy");
  assert.equal(h.mock.calls[0].value.value, "008421");
  h.click('[data-account="google"] [data-action="next"]');
  assert.equal(h.mock.calls.length, 2);
  assert.equal(h.mock.calls[1].value.slot, "next");
  assert.equal(h.mock.calls[1].value.value, "312099");
  assert.equal(
    h.root.querySelector('[data-account="hotp"] [data-action="next"]').hidden,
    true,
  );
});
test("new clicks use the latest account generation, while menus do not copy a code", (t) => {
  const h = fixture(t);
  h.click('[data-account="google"] [data-action="menu"]');
  assert.equal(h.mock.calls.length, 0);
  h.mock.state.library.accounts[0].ref.generation = 2;
  h.mock.emit();
  h.click('[data-account="google"] [data-action="menu"]');
  h.click('[data-account="google"] [data-action="edit"]');
  assert.deepEqual(h.mock.calls[0].value.request, {
    kind: "account-edit",
    account: { id: "google", generation: 2 },
  });
});
test("all five account actions reach typed host or account commands", (t) => {
  const h = fixture(t);
  for (const action of ["qr", "uri", "link", "edit", "delete"]) {
    h.click('[data-account="google"] [data-action="menu"]');
    h.click(`[data-account="google"] [data-action="${action}"]`);
  }
  assert.deepEqual(
    h.mock.calls.map((call) => call.method),
    [
      "host.open",
      "accounts.copyURI",
      "accounts.copyShareLink",
      "host.open",
      "host.open",
    ],
  );
  assert.deepEqual(
    h.mock.calls
      .filter((call) => call.method === "host.open")
      .map((call) => call.value.request.kind),
    ["account-qr", "account-edit", "account-delete"],
  );
});
test("grouped/flat, filtering and sorting use view ports", (t) => {
  const h = fixture(t);
  assert.equal(h.root.querySelectorAll(".pixel-card").length, 6);
  const select = h.root.querySelector('[data-setting="mode"]');
  select.value = "flat";
  select.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(h.mock.calls.at(-1).method, "view.setMode");
  assert.equal(h.root.querySelectorAll(".pixel-card").length, 6);
  const service = h.root.querySelector('[data-setting="service"]');
  service.value = "Google";
  service.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(
    h.root.querySelectorAll(".pixel-groups [data-account]").length,
    1,
  );
  const sort = h.root.querySelector('[data-setting="sort"]');
  sort.value = "account-desc";
  sort.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.deepEqual(h.mock.calls.at(-1).value, { flatSort: "account-desc" });
});
test("OTP publications preserve focused search and open menu DOM", (t) => {
  const h = fixture(t);
  const search = h.root.querySelector('input[type="search"]');
  search.focus();
  search.value = "Goo";
  search.setSelectionRange(1, 2);
  const current = h.root.querySelector('[data-account="google"]');
  h.mock.state.library.accounts[0].otp.current.value = "001122";
  h.mock.emit();
  assert.equal(h.window.document.activeElement, search);
  assert.equal(search.value, "Goo");
  assert.equal(search.selectionStart, 1);
  assert.equal(h.root.querySelector('[data-account="google"]'), current);
  h.click('[data-account="google"] [data-action="menu"]');
  const trigger = h.root.querySelector(
    '[data-account="google"] [data-action="menu"]',
  );
  trigger.focus();
  h.mock.emit();
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(h.window.document.activeElement, trigger);
});
test("menus support arrow navigation, escape and outside close without calling host", (t) => {
  const h = fixture(t);
  const trigger = h.root.querySelector(
    '[data-account="google"] [data-action="menu"]',
  );
  trigger.focus();
  trigger.dispatchEvent(
    new h.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  assert.equal(h.window.document.activeElement.dataset.action, "qr");
  h.window.document.activeElement.dispatchEvent(
    new h.window.KeyboardEvent("keydown", { key: "End", bubbles: true }),
  );
  assert.equal(h.window.document.activeElement.dataset.action, "delete");
  h.window.document.activeElement.dispatchEvent(
    new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(h.window.document.activeElement, trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  trigger.click();
  h.window.document.body.dispatchEvent(
    new h.window.Event("pointerdown", { bubbles: true }),
  );
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(h.mock.calls.length, 0);
});
test("service filters and HOTP recovery rows preserve focus across publications", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.host.operations = [
      {
        operationId: "check-1",
        accountId: "hotp",
        type: "hotp",
        clipboard: "pending",
        reservation: "unknown",
        status: "running",
        recovery: "reconcile",
      },
    ];
  });
  const filter = h.root.querySelector('[data-setting="service"]');
  filter.focus();
  filter.value = "Google";
  filter.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(h.window.document.activeElement, filter);
  const recover = h.root.querySelector('[data-action="reconcile"]');
  recover.focus();
  h.mock.state.host.operations[0].reservation = "confirmed";
  h.mock.emit();
  assert.equal(h.root.querySelector('[data-action="reconcile"]'), recover);
  assert.equal(h.window.document.activeElement, recover);
});
test("account host flows restore focus to the visible menu trigger", (t) => {
  const h = fixture(t);
  const trigger = h.click('[data-account="google"] [data-action="menu"]');
  h.click('[data-account="google"] [data-action="edit"]');
  assert.equal(h.mock.calls.at(-1).value.options.returnFocus, trigger);
});
test("four animation preferences remain presentation-only and reduced motion prevents new effects", (t) => {
  const h = fixture(t);
  const value = h.root.querySelector(
    '[data-account="google"] .pixel-otp-value',
  );
  const effects = [];
  let cancelled = 0;
  value.animate = (frames) => {
    effects.push(frames);
    return {
      cancel() {
        cancelled++;
      },
    };
  };
  for (const effect of ["none", "flow", "flip", "spotlight"]) {
    h.mock.state.preferences.otpAnimation = effect;
    h.mock.state.library.accounts[0].otp.current.value = String(
      effects.length + 1,
    ).padStart(6, "0");
    // Ensure each publication is a distinct display revision even for "none".
    h.mock.state.library.accounts[0].otp.current.value =
      effect === "none"
        ? "000000"
        : effect === "flow"
          ? "000001"
          : effect === "flip"
            ? "000002"
            : "000003";
    h.mock.emit();
  }
  assert.equal(effects.length, 3);
  h.mock.state.preferences.reducedMotion = true;
  h.mock.state.library.accounts[0].otp.current.value = "000004";
  h.mock.emit();
  assert.equal(effects.length, 3);
  h.click('[data-account="google"] [data-action="copy"]');
  assert.equal(h.mock.calls.at(-1).value.value, "000004");
  assert.ok(cancelled >= 3);
});
test("global user features keep direct or exact aggregate paths while status entries remain conditional", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.host.installAvailable = true;
  });
  h.click('[data-action="route"][data-value="more"]');
  const tools = new Set([
    "tool:qr-decode",
    "tool:qr-generate",
    "tool:base32",
    "tool:timestamp",
    "tool:key-check",
    "tool:key-generate",
  ]);
  const providers = new Set([
    "sync-provider:webdav",
    "sync-provider:s3",
    "sync-provider:onedrive",
    "sync-provider:gdrive",
  ]);
  const conditional = new Set([
    "hidden-accounts",
    "offline-queue",
    "offline-queue-status-retry",
    "login",
    "recovery",
  ]);
  for (const id of conditional)
    assert.equal(
      h.root.querySelector('.pixel-feature[data-value="' + id + '"]'),
      null,
    );
  const descriptors = h.mock.sdk.host
    .listActions()
    .filter((item) => !item.requires && !conditional.has(item.actionId));
  for (const descriptor of descriptors) {
    const targetId = tools.has(descriptor.actionId)
      ? "tools"
      : providers.has(descriptor.actionId)
        ? "settings:sync"
        : descriptor.actionId;
    const node = h.root.querySelector(
      `.pixel-feature[data-action="host"][data-value="${targetId}"]`,
    );
    assert.ok(node, `Reachable path for ${descriptor.actionId}`);
    const group = node.closest(".pixel-management-group");
    const toggle = group?.querySelector(".pixel-group-toggle");
    if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
    assert.ok(!node.closest("[hidden]"));
    const before = h.mock.calls.length;
    node.click();
    assert.equal(h.mock.calls.length, before + 1);
    assert.deepEqual(
      h.mock.calls.at(-1).value.request,
      descriptors.find((item) => item.actionId === targetId).request,
    );
  }
  assert.equal(
    h.root.querySelectorAll('.pixel-feature[data-value^="tool:"]').length,
    0,
  );
  assert.equal(
    h.root.querySelectorAll('.pixel-feature[data-value^="sync-provider:"]')
      .length,
    0,
  );
});
test("queue edit/retry/cancel use current operation IDs; unavailable queue exposes refresh", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.queue = {
      unavailable: true,
      operations: [
        {
          operationId: "queued-1",
          name: "Pending account",
          canEdit: true,
          canRetry: true,
          canCancel: true,
          status: "failed",
        },
      ],
    };
  });
  for (const kind of [
    "offline-queue-edit",
    "offline-queue-retry",
    "offline-queue-cancel",
  ])
    h.click(`[data-action="queue"][data-value="${kind}"]`);
  assert.deepEqual(
    h.mock.calls.map((call) => call.value.request),
    ["offline-queue-edit", "offline-queue-retry", "offline-queue-cancel"].map(
      (kind) => ({ kind, operationId: "queued-1" }),
    ),
  );
  h.click('.pixel-queue-region [data-value="offline-queue-status-retry"]');
  assert.equal(
    h.mock.calls.at(-1).value.request.kind,
    "offline-queue-status-retry",
  );
});
test("HOTP facts and recovery stay visible when the account is filtered out", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.host.operations = [
      {
        operationId: "hotp-1",
        accountId: "hotp",
        type: "hotp",
        clipboard: "pending",
        reservation: "confirmed",
        status: "running",
        recovery: "reload-required",
      },
    ];
    mock.state.library.view.query = "Google";
  });
  assert.equal(h.root.querySelector(".pixel-operation-region").hidden, false);
  assert.equal(
    h.root.querySelector('.pixel-groups [data-account="hotp"]'),
    null,
  );
  h.click('[data-action="reconcile"]');
  assert.deepEqual(h.mock.calls.at(-1), {
    method: "otp.reconcile",
    value: "hotp-1",
  });
  h.click('[data-action="reload"][data-value="recovery"]');
  assert.deepEqual(h.mock.calls.at(-1), {
    method: "lifecycle.requestReload",
    value: "recovery",
  });
});
test("HOTP panel closes only for complete success or confirmed safe readback", (t) => {
  const h = fixture(t);
  const complete = {
    operationId: "status-case",
    accountId: "hotp",
    type: "hotp",
    status: "settled",
    clipboard: "copied",
    reservation: "confirmed",
    localCommit: "committed",
    reconciliation: "not-needed",
    recovery: "none",
  };
  const cases = [
    ["complete local commit", {}, true],
    [
      "safe confirmed readback",
      {
        localCommit: "failed",
        reconciliation: "succeeded",
        recovery: "reconciled",
      },
      true,
    ],
    ["unsettled commit", { status: "running" }, false],
    [
      "conflict and failed read",
      {
        localCommit: "failed",
        reconciliation: "failed",
        recovery: "retry-reconcile",
      },
      false,
    ],
    ["read in progress", { reconciliation: "running" }, false],
    ["read still failed", { reconciliation: "failed" }, false],
    [
      "unknown POST after readback",
      {
        reservation: "unknown",
        localCommit: "not-attempted",
        reconciliation: "succeeded",
        recovery: "reconciled",
      },
      false,
    ],
    [
      "rejected POST after readback",
      {
        reservation: "rejected",
        localCommit: "not-attempted",
        reconciliation: "succeeded",
        recovery: "reconciled",
      },
      false,
    ],
    [
      "clipboard failed after reservation",
      { clipboard: "failed", recovery: "counter-advanced-copy-failed" },
      false,
    ],
    [
      "clipboard pending with recovery",
      {
        clipboard: "pending",
        reconciliation: "succeeded",
        recovery: "reload-required",
      },
      false,
    ],
    ["missing reconciliation fact", { reconciliation: undefined }, false],
    ["unresolved local refresh", { reason: "local-refresh-failed" }, false],
  ];
  for (const [label, patch, hidden] of cases) {
    h.mock.state.host.operations = [{ ...complete, ...patch }];
    h.mock.emit();
    const panel = h.root.querySelector(".pixel-operation-region");
    assert.equal(panel.hidden, hidden, label);
    if (!hidden) {
      assert.ok(panel.querySelector('[data-action="reconcile"]'), label);
      assert.equal(
        panel.querySelector('[data-action="reconcile"]').disabled,
        patch.reconciliation === "running",
        label,
      );
    }
  }
  assert.deepEqual(h.mock.calls, []);
});
test("loading/error/empty/search and logged-out states remain distinct and actionable", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.library.accounts = [];
    mock.state.library.state = "loading";
  });
  assert.equal(
    h.root.querySelector(".pixel-empty-state button").dataset.action,
    "refresh",
  );
  h.mock.state.library.state = "ready";
  h.mock.emit();
  assert.equal(
    h.root.querySelector(".pixel-empty-state button").dataset.value,
    "account-add",
  );
  h.mock.state.library.view.query = "missing";
  h.mock.emit();
  assert.equal(
    h.root.querySelector(".pixel-empty-state button").dataset.action,
    "clear",
  );
  h.mock.state.session.state = "logged-out";
  h.mock.state.epochs.session++;
  h.mock.emit();
  assert.equal(
    h.root.querySelector(".pixel-empty-state button").dataset.value,
    "login",
  );
});
test("HOTP busy/offline blocks click; unready code never starts copy", (t) => {
  const h = fixture(t, (mock) => {
    mock.state.library.accounts[3].otp.current.copyAvailability = "busy";
    mock.state.library.accounts[0].otp.current = null;
  });
  h.click('[data-account="hotp"] [data-action="copy"]');
  h.click('[data-account="google"] [data-action="copy"]');
  assert.equal(h.mock.calls.length, 0);
});
test("appearance update changes settings without remounting cards or resetting query", (t) => {
  const h = fixture(t);
  const card = h.root.querySelector('[data-account="google"]');
  h.mock.sdk.view.setQuery("Google");
  h.app.update({
    settings: {
      landscape: "outpost",
      accent: "rose",
      density: "compact",
      pixelChinese: true,
    },
  });
  assert.equal(h.root.querySelector('[data-account="google"]'), card);
  assert.equal(h.mock.state.library.view.query, "Google");
  assert.equal(h.root.querySelector(".pixel-theme").dataset.accent, "rose");
  assert.equal(h.root.querySelector(".pixel-brand-name").textContent, "2FA");
  assert.equal(h.mock.listeners, 1);
});
test("15 languages follow host preferences through the unique host settings entry", async (t) => {
  const h = fixture(t);
  h.click('[data-action="route"][data-value="more"]');
  h.click('[data-action="management-group"][data-value="settings"]');
  h.click('[data-action="host"][data-value="settings:preferences"]');
  assert.deepEqual(h.mock.calls.at(-1).value.request, {
    kind: "settings",
    section: "preferences",
  });
  assert.equal(h.root.querySelectorAll('[data-setting="language"]').length, 0);
  for (const [locale] of languages.filter(([locale]) => locale !== "auto")) {
    await h.mock.sdk.preferences.set({ language: locale });
    assert.equal(h.root.querySelector(".pixel-theme").lang, locale);
    assert.equal(
      h.root.querySelector(".pixel-account-page h2").textContent,
      localText(locale, "accounts"),
    );
    assert.equal(
      h.root.querySelector('[data-action="route"][data-value="more"]')
        .textContent,
      localText(locale, "manage"),
    );
    assert.ok(!h.root.textContent.includes("offlineQueueView"));
  }
  await flush();
  assert.equal(
    h.mock.calls.filter((call) => call.method === "preferences.set").length,
    15,
  );
});
test("trusted clock getter drives countdown, never a stale snapshot sample", (t) => {
  const h = fixture(t, (mock) => {
    mock.sdk.clock.now = () => 59000;
    mock.state.clock.correctedNow = 1;
  });
  assert.equal(
    h.root.querySelector('[data-account="google"] .pixel-expiry-label strong')
      .textContent,
    "1s",
  );
  h.mock.sdk.clock.now = () => null;
  h.mock.emit();
  assert.equal(
    h.root.querySelector('[data-account="google"] .pixel-expiry-label strong')
      .textContent,
    "Updating…",
  );
});
test("abort removes only its surface and listeners; late completion cannot revive the view", async (t) => {
  let resolve;
  const pending = new Promise((yes) => (resolve = yes));
  const h = fixture(t, (mock) => {
    mock.sdk.otp.copy = () => pending;
  });
  const sibling = h.window.document.createElement("div");
  h.root.append(sibling);
  h.click('[data-account="google"] [data-action="copy"]');
  h.controller.abort();
  resolve({ status: "settled", clipboard: "copied" });
  await flush();
  h.mock.emit();
  assert.equal(h.mock.listeners, 0);
  assert.equal(h.root.children.length, 1);
  assert.equal(h.root.firstElementChild, sibling);
});
test("a session change clears sensitive account DOM and suppresses late copy feedback", async (t) => {
  let resolve;
  const pending = new Promise((yes) => (resolve = yes));
  const h = fixture(t, (mock) => {
    mock.sdk.otp.copy = () => pending;
  });
  h.click('[data-account="google"] [data-action="copy"]');
  h.mock.state.epochs.session++;
  h.mock.state.library.accounts = [];
  h.mock.state.session.state = "logged-out";
  h.mock.emit();
  resolve({ status: "rejected", reason: "session-invalidated" });
  await flush();
  assert.equal(h.root.querySelectorAll("[data-account]").length, 0);
  assert.equal(h.root.querySelector(".pixel-notice").hidden, true);
});
test("unsupported host hashes are preserved and never hijacked during mount", (t) => {
  const h = fixture(t);
  h.window.location.hash = "oauth-return";
  h.app.update({ settings: {} });
  assert.equal(h.window.location.hash, "#oauth-return");
});
for (const page of ["more", "preferences"]) {
  test(`skip from ${page} reveals and focuses accounts without changing SDK selection or invoking commands`, (t) => {
    const h = fixture(t, (mock) => {
      mock.state.library.view.query = "Google";
      mock.state.library.view.serviceFilter = "Google";
    });
    if (page === "preferences") {
      h.window.location.hash = "#/theme/pixel/preferences";
      h.window.dispatchEvent(new h.window.Event("hashchange"));
    } else h.click(`[data-action="route"][data-value="${page}"]`);
    const accounts = h.root.querySelector(".pixel-account-page");
    assert.equal(accounts.hidden, true);
    assert.equal(h.window.location.hash, `#/theme/pixel/${page}`);
    h.click('[data-action="skip"]');
    assert.equal(h.window.location.hash, "#/theme/pixel/accounts");
    assert.equal(accounts.hidden, false);
    assert.equal(h.window.document.activeElement, accounts);
    assert.equal(h.mock.sdk.getSnapshot().library.view.query, "Google");
    assert.equal(h.mock.sdk.getSnapshot().library.view.serviceFilter, "Google");
    assert.equal(
      h.root.querySelectorAll(".pixel-groups [data-account]").length,
      1,
    );
    assert.deepEqual(h.mock.calls, []);
  });
}
