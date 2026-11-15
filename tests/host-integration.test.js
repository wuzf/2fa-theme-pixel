import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mount } from "../src/theme.js";
import { hostAppearance } from "../src/hostAppearance.js";

const hostRoot = process.env.HOST_ROOT;
const integration = hostRoot ? test : test.skip;
const records = [
  {
    id: "totp",
    name: "RFC account",
    account: "synthetic@example.invalid",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    type: "TOTP",
    digits: 8,
    period: 30,
    algorithm: "SHA1",
  },
  {
    id: "hotp",
    name: "RFC HOTP",
    account: "Synthetic counter",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    type: "HOTP",
    digits: 6,
    algorithm: "SHA1",
    counter: 0,
    hotpCounterNamespace: "pixel-test",
  },
];
async function fixture(t, { fetch: customFetch } = {}) {
  const { createRuntimeFixture } = await import(
    pathToFileURL(resolve(hostRoot, "tests/helpers/theme-runtime.js")).href
  );
  let server = structuredClone(records);
  const copies = [],
    requests = [];
  const h = await createRuntimeFixture({
    accountDOM: false,
    clipboard: { writeText: async (value) => copies.push(value) },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (customFetch) return customFetch(url, options);
      if (url === "/api/secrets/hotp/counter") {
        server = server.map((item) =>
          item.id === "hotp" ? { ...item, counter: item.counter + 1 } : item,
        );
        return Response.json({
          success: true,
          data: { secret: server.find((item) => item.id === "hotp") },
        });
      }
      if (url === "/api/secrets") return Response.json(server);
      return Response.json({});
    },
  });
  h.setClock(59000);
  const runtime = h.getThemeRuntime();
  h.replaceSecretRecords(server, { source: "server", accessVerified: true });
  await runtime.otp.refresh();
  const root = h.document.createElement("div");
  h.document.body.append(root);
  const app = mount({
    root,
    sdk: runtime.sdk,
    appearance: {
      settings: {},
    },
  });
  t.after(async () => {
    app.unmount();
    await h.dispose();
  });
  const click = (selector) => {
    const node = root.querySelector(selector);
    assert.ok(node, selector);
    node.click();
  };
  async function wait(predicate) {
    for (let n = 0; n < 100; n++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(predicate(), "Expected host state did not settle");
  }
  return { ...h, runtime, root, app, copies, requests, click, wait };
}

integration(
  "actual emitted SDK renders RFC TOTP and performs current/next copy without legacy account DOM",
  async (t) => {
    const h = await fixture(t);
    assert.equal(h.document.getElementById("secretsList"), null);
    assert.equal(
      h.root.querySelector('[data-account="totp"] .pixel-otp-value')
        .textContent,
      "94287082",
    );
    h.click('[data-account="totp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["94287082"]);
    const next = h.runtime.sdk
      .getSnapshot()
      .library.accounts.find((item) => item.ref.id === "totp").otp.next.value;
    h.click('[data-account="totp"] [data-action="next"]');
    assert.deepEqual(h.copies, ["94287082", next]);
  },
);
integration(
  "the copy notice says whether the current or the next code was copied",
  async (t) => {
    const h = await fixture(t);
    const notice = h.root.querySelector(".pixel-notice");
    const name = h.runtime.sdk
      .getSnapshot()
      .library.accounts.find((item) => item.ref.id === "totp").service.label;
    const said = (key) => h.runtime.sdk.i18n.t(key, { name });
    h.click('[data-account="totp"] [data-action="copy"]');
    await h.wait(() => !notice.hidden);
    assert.equal(notice.textContent, said("coreCopiedService"));
    h.click('[data-account="totp"] [data-action="next"]');
    await h.wait(() => notice.textContent === said("coreCopiedNextService"));
    assert.notEqual(said("coreCopiedService"), said("coreCopiedNextService"));
    assert.match(notice.textContent, new RegExp(name));
  },
);
integration(
  "actual emitted HOTP command reserves exactly once and publishes authoritative counter/code",
  async (t) => {
    const h = await fixture(t);
    h.click('[data-account="hotp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["755224"]);
    await h.wait(
      () =>
        h.getPrivateRecords().find((item) => item.id === "hotp").counter ===
          1 &&
        h.root.querySelector('[data-account="hotp"] .pixel-otp-value')
          .textContent === "287082",
    );
    assert.equal(
      h.requests.filter((item) => item.url === "/api/secrets/hotp/counter")
        .length,
      1,
    );
    assert.equal(
      h.root.querySelector('[data-account="hotp"] .pixel-expiry-label strong')
        .textContent,
      "1",
    );
  },
);
integration(
  "actual emitted URI/share-link and host add/edit entry points use real commands and dialogs",
  async (t) => {
    const h = await fixture(t);
    h.click('[data-account="hotp"] [data-action="uri"]');
    assert.match(h.copies[0], /^otpauth:\/\/hotp\//);
    assert.match(h.copies[0], /counter=0/);
    h.click('[data-account="totp"] [data-action="link"]');
    assert.match(h.copies[1], /\/otp\//);
    assert.match(h.copies[1], /digits=8/);
    h.click('[data-account="totp"] [data-action="edit"]');
    await h.wait(
      () => h.document.getElementById("secretName")?.value === "RFC account",
    );
    assert.equal(
      h.document.getElementById("secretService").value,
      "synthetic@example.invalid",
    );
  },
);
integration(
  "actual emitted HOTP partial success remains recoverable after a local counter conflict and failed read",
  async (t) => {
    let finishReservation;
    const reservation = new Promise((resolve) => {
      finishReservation = resolve;
    });
    let reconcileAvailable = false;
    let pendingRead;
    let finishRead;
    const changed = records.map((account) =>
      account.id === "hotp" ? { ...account, counter: 9 } : { ...account },
    );
    const h = await fixture(t, {
      fetch: async (url) => {
        if (url === "/api/secrets/hotp/counter") return reservation;
        if (url === "/api/secrets") {
          if (pendingRead) return pendingRead;
          return reconcileAvailable
            ? Response.json(changed)
            : Response.json(
                { error: "temporarily unavailable" },
                { status: 503 },
              );
        }
        return Response.json({});
      },
    });
    const operation = () => h.runtime.sdk.getSnapshot().host.operations[0];
    const countRequests = (url) =>
      h.requests.filter((request) => request.url === url).length;
    const panel = h.root.querySelector(".pixel-operation-region");
    h.click('[data-account="hotp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["755224"]);
    assert.equal(countRequests("/api/secrets/hotp/counter"), 1);
    const session = h.runtime.sdk.getSnapshot().epochs.session;
    h.replaceSecretRecords(changed, { source: "server", accessVerified: true });
    finishReservation(
      Response.json({
        success: true,
        data: { secret: { ...records[1], counter: 1 } },
      }),
    );
    await h.wait(() => operation()?.status === "settled");
    await Promise.resolve();
    assert.equal(h.runtime.sdk.getSnapshot().epochs.session, session);
    assert.deepEqual(
      Object.fromEntries(
        [
          "status",
          "clipboard",
          "reservation",
          "localCommit",
          "reconciliation",
          "recovery",
        ].map((key) => [key, operation()[key]]),
      ),
      {
        status: "settled",
        clipboard: "copied",
        reservation: "confirmed",
        localCommit: "failed",
        reconciliation: "failed",
        recovery: "retry-reconcile",
      },
    );
    assert.equal(
      h.getPrivateRecords().find((account) => account.id === "hotp").counter,
      9,
    );
    assert.equal(countRequests("/api/secrets"), 1);
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelectorAll('[data-action="reconcile"]').length, 1);
    const failedText = h.runtime.sdk.i18n.t("coreHotpReconcileFailed");
    const clipboardText = h.runtime.sdk.i18n.t("coreHotpClipboardState", {
      state: h.runtime.sdk.i18n.t("coreHotpStateCopied"),
    });
    const reservationText = h.runtime.sdk.i18n.t("coreHotpReservationState", {
      state: h.runtime.sdk.i18n.t("coreHotpStateConfirmed"),
    });
    assert.ok(panel.textContent.includes(failedText));
    const notice = h.root.querySelector(".pixel-notice");
    assert.ok(notice.textContent.includes(clipboardText));
    assert.ok(notice.textContent.includes(reservationText));
    assert.ok(notice.textContent.includes(failedText));
    assert.notEqual(notice.textContent, "Copied");

    h.runtime.sdk.view.setQuery("RFC account");
    assert.equal(
      h.root.querySelector('.pixel-groups [data-account="hotp"]'),
      null,
    );
    assert.equal(panel.hidden, false);
    pendingRead = new Promise((resolve) => {
      finishRead = resolve;
    });
    h.click('.pixel-operation-region [data-action="reconcile"]');
    await h.wait(() => countRequests("/api/secrets") === 2);
    assert.equal(operation().reconciliation, "running");
    assert.equal(
      panel.querySelector('[data-action="reconcile"]').disabled,
      true,
    );
    assert.equal(panel.hidden, false);
    finishRead(Response.json({ error: "still unavailable" }, { status: 503 }));
    pendingRead = null;
    await h.wait(
      () =>
        countRequests("/api/secrets") === 2 &&
        operation().reconciliation === "failed",
    );
    assert.equal(panel.hidden, false);
    assert.equal(
      panel.querySelector('[data-action="reconcile"]').disabled,
      false,
    );
    assert.equal(countRequests("/api/secrets/hotp/counter"), 1);
    assert.deepEqual(h.copies, ["755224"]);

    reconcileAvailable = true;
    h.click('.pixel-operation-region [data-action="reconcile"]');
    await h.wait(() => operation().reconciliation === "succeeded");
    assert.equal(operation().recovery, "reconciled");
    assert.equal(operation().localCommit, "failed");
    assert.equal(panel.hidden, true);
    assert.equal(countRequests("/api/secrets"), 3);
    assert.equal(countRequests("/api/secrets/hotp/counter"), 1);
    assert.deepEqual(h.copies, ["755224"]);
  },
);
integration(
  "actual emitted unknown HOTP reservation stays explicit after successful reconciliation",
  async (t) => {
    const advanced = records.map((account) =>
      account.id === "hotp" ? { ...account, counter: 1 } : { ...account },
    );
    const h = await fixture(t, {
      fetch: async (url) =>
        url === "/api/secrets/hotp/counter"
          ? Response.json({ error: "reservation unconfirmed" }, { status: 503 })
          : Response.json(url === "/api/secrets" ? advanced : {}),
    });
    h.click('[data-account="hotp"] [data-action="copy"]');
    const operation = () => h.runtime.sdk.getSnapshot().host.operations[0];
    await h.wait(() => operation()?.status === "settled");
    assert.equal(operation().reservation, "unknown");
    assert.equal(operation().reconciliation, "succeeded");
    const panel = h.root.querySelector(".pixel-operation-region");
    assert.equal(panel.hidden, false);
    h.click('.pixel-operation-region [data-action="reconcile"]');
    const unknown = h.runtime.sdk.i18n.t("coreHotpReservationState", {
      state: h.runtime.sdk.i18n.t("coreHotpStateUnknown"),
    });
    await h.wait(
      () =>
        operation().reconciliation === "succeeded" &&
        h.requests.filter((request) => request.url === "/api/secrets")
          .length === 2,
    );
    await Promise.resolve();
    assert.equal(panel.hidden, false);
    assert.ok(
      h.root.querySelector(".pixel-notice").textContent.includes(unknown),
    );
    assert.notEqual(h.root.querySelector(".pixel-notice").textContent, "Done");
    assert.equal(
      h.requests.filter(
        (request) => request.url === "/api/secrets/hotp/counter",
      ).length,
      1,
    );
    assert.deepEqual(h.copies, ["755224"]);
  },
);
integration(
  "actual emitted language/preferences/view contract keeps all 15 languages free of internal labels",
  async (t) => {
    const h = await fixture(t);
    for (const language of [
      "zh-CN",
      "zh-TW",
      "en",
      "ja",
      "ko",
      "de",
      "fr",
      "es",
      "pt-BR",
      "it",
      "ru",
      "tr",
      "id",
      "vi",
      "th",
    ]) {
      await h.runtime.sdk.preferences.set({ language });
      assert.equal(h.root.querySelector(".pixel-theme").lang, language);
      const descriptors = h.runtime.sdk.host
        .listActions()
        .filter((item) => !item.requires);
      assert.equal(h.runtime.sdk.getSnapshot().session.state, "authenticated");
      // The public host contract groups tools/sync and makes session, queue
      // and installation actions contextual. Enabled descriptors alone are
      // not a requirement to add every command to the management menu.
      const required = [
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
        "logout",
        "extension",
        "quick-otp",
      ];
      for (const id of required) {
        const button = h.root.querySelector(
          `[data-action="host"][data-value="${id}"]`,
        );
        const descriptor = descriptors.find((item) => item.actionId === id);
        assert.ok(descriptor, language + ": descriptor " + id);
        assert.ok(button, language + ": required entry " + id);
        assert.ok(button.textContent.trim(), language + ": empty " + id);
        assert.ok(
          !button.textContent.includes(descriptor.labelKey),
          language + ": internal label " + descriptor.labelKey,
        );
      }
      // Safe mode is offered by the host's error bar, never by the menu.
      for (const id of [
        "login",
        "hidden-accounts",
        "offline-queue",
        "offline-queue-status-retry",
        "pwa-install",
        "recovery",
      ]) {
        assert.ok(
          h.root.querySelector(`.pixel-feature[data-value="${id}"]`) === null,
          language + ": inactive contextual entry " + id,
        );
      }
      for (const descriptor of descriptors) {
        // Hidden and aggregated commands still need translated labels for
        // their status/host flows in every supported language.
        assert.notEqual(
          h.runtime.sdk.i18n.t(descriptor.labelKey),
          descriptor.labelKey,
          language + ": child " + descriptor.actionId,
        );
      }
    }
    h.runtime.sdk.view.setMode("flat");
    h.runtime.sdk.view.setSort({ flatSort: "name-desc" });
    assert.equal(h.root.querySelector('[data-setting="mode"]').value, "flat");
    assert.equal(
      h.root.querySelector('[data-setting="sort"]').value,
      "name-desc",
    );
  },
);

integration(
  "actual host session and PWA changes expose only the relevant authentication and installation entries",
  async (t) => {
    const h = await fixture(t);
    const feature = (id) =>
      h.root.querySelector(`.pixel-feature[data-value="${id}"]`);
    assert.equal(h.runtime.sdk.getSnapshot().session.state, "authenticated");
    assert.equal(feature("login"), null);
    assert.ok(feature("logout"));
    assert.equal(feature("pwa-install"), null);

    // Exercise the emitted host event handling rather than mutating a mock
    // descriptor or reproducing the theme's menu filtering implementation.
    const offer = new h.window.Event("beforeinstallprompt", {
      cancelable: true,
    });
    h.window.dispatchEvent(offer);
    assert.equal(h.runtime.sdk.getSnapshot().host.installAvailable, true);
    assert.ok(feature("pwa-install"));
    h.window.dispatchEvent(new h.window.Event("appinstalled"));
    assert.equal(h.runtime.sdk.getSnapshot().host.installAvailable, false);
    assert.equal(feature("pwa-install"), null);

    h.invalidateSecretSession({ blocked: false });
    h.replaceSecretRecords(records, {
      source: "local",
      accessVerified: false,
    });
    assert.equal(h.runtime.sdk.getSnapshot().session.state, "unconfirmed");
    assert.ok(
      feature("logout"),
      "An unconfirmed local vault must remain lockable",
    );

    h.invalidateSecretSession();
    assert.equal(h.runtime.sdk.getSnapshot().session.state, "logged-out");
    assert.ok(feature("login"), "A logged-out page needs a login entry");
    assert.equal(feature("logout"), null);
    assert.equal(h.root.querySelectorAll("[data-account]").length, 0);
  },
);

integration(
  "Pixel appearance mapping is accepted by the actual host validator for every palette and font setting",
  async () => {
    const { normalizeHostAppearance } = await import(
      pathToFileURL(resolve(hostRoot, "src/ui/runtime/hostAppearance.js")).href
    );
    for (const accent of ["green", "violet", "rose"])
      for (const dark of [false, true])
        for (const pixelChinese of [false, true]) {
          const tokens = hostAppearance({ accent, pixelChinese }, dark);
          assert.deepEqual(normalizeHostAppearance(tokens), tokens);
        }
  },
);
