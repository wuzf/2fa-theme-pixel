import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t) {
  const window = new Window({ url: "https://inventory.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.emit();
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
  return { root, mock };
}

test("the bag has no detail panel; every slot carries its own code, next code and timer", async (t) => {
  const h = fixture(t);
  assert.equal(h.root.querySelector(".pixel-inspect, .pixel-hp"), null);
  assert.equal(h.root.querySelector("[data-selected]"), null);
  const slot = h.root.querySelector('article[data-account="google"]');
  assert.equal(
    slot.querySelector(".pixel-account-address").textContent,
    "design.team@example.invalid",
  );
  assert.equal(slot.querySelector(".pixel-otp-value").textContent, "008421");
  assert.match(slot.querySelector(".pixel-otp-next").textContent, /312099/);
  assert.ok(slot.querySelector(".pixel-expiry .pixel-progress"));
});

test("the app bar has menu, title, view and search; search opens in place of the title", async (t) => {
  const h = fixture(t);
  const bar = h.root.querySelector(".pixel-topbar-inner");
  assert.deepEqual(
    [...bar.querySelectorAll("[data-action]")]
      .filter((node) => !node.closest(".pixel-search, .pixel-display-panel"))
      .map((node) => node.dataset.action),
    ["route", "display", "search"],
  );
  const brand = bar.querySelector(".pixel-brand");
  const form = bar.querySelector(".pixel-search");
  const toggle = bar.querySelector('[data-action="search"]');
  assert.equal(form.hidden, true);
  assert.equal(brand.hidden, false);
  toggle.click();
  assert.equal(form.hidden, false);
  assert.equal(brand.hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const input = form.querySelector("input");
  input.value = "Goo";
  input.dispatchEvent(
    new input.ownerDocument.defaultView.Event("input", { bubbles: true }),
  );
  assert.equal(h.mock.sdk.getSnapshot().library.view.query, "Goo");
  toggle.click();
  assert.equal(form.hidden, true);
  assert.equal(brand.hidden, false);
  assert.equal(h.mock.sdk.getSnapshot().library.view.query, "");
});

test("Escape in the search field closes the search and clears it", async (t) => {
  const h = fixture(t);
  const bar = h.root.querySelector(".pixel-topbar-inner");
  bar.querySelector('[data-action="search"]').click();
  const input = bar.querySelector(".pixel-search input");
  const view = input.ownerDocument.defaultView;
  input.value = "Goo";
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
  input.dispatchEvent(
    new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(bar.querySelector(".pixel-search").hidden, true);
  assert.equal(bar.querySelector(".pixel-brand").hidden, false);
  assert.equal(h.mock.sdk.getSnapshot().library.view.query, "");
});

test("the category tabs are the only visible service filter", async () => {
  const css = await readFile(
    new URL("../src/styles/inventory.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.pixel-bag-header \.pixel-service-filter \{\s*display: none;/,
  );
});

test("pixel typography is on unless the setting turns it off", async (t) => {
  const h = fixture(t);
  const surface = h.root.querySelector(".pixel-theme");
  assert.equal(surface.dataset.pixelText, "true");
  const { theme: config } = await import("../theme.config.js");
  assert.equal(
    config.settings.find((field) => field.key === "pixelChinese").default,
    true,
  );
});

test("an HOTP slot names its counter in place of the timer", async (t) => {
  const h = fixture(t);
  const slot = h.root.querySelector('article[data-account="hotp"]');
  assert.equal(slot.dataset.type, "HOTP");
  const label = slot.querySelector(".pixel-expiry-label");
  assert.equal(label.querySelector("span").textContent, "Counter");
  assert.match(label.querySelector("strong").textContent, /^\d+$/);
  const css = await readFile(
    new URL("../src/styles/inventory.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.pixel-card:not\(\[data-type="HOTP"\]\)\s+\.pixel-expiry-label\s+> span \{\s*display: none;/,
  );
});

test("slot styles show the account, the next code and the seconds left", async () => {
  const css = await readFile(
    new URL("../src/styles/inventory.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(css, /pixel-inspect|pixel-hp/);
  const rule = (selector) =>
    new RegExp(
      selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}",
    ).exec(css)?.[1] ?? "";
  for (const part of [
    "pixel-account-address",
    "pixel-otp-next",
    "pixel-expiry-label",
  ])
    assert.doesNotMatch(
      rule(`.pixel-theme .pixel-bag-window .pixel-account-grid .${part}`),
      /display:\s*none/,
      part,
    );
  const phone = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(
    phone,
    /\.pixel-groups \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.doesNotMatch(phone, /display:\s*none/);
});

test("phones get one slot per row with the full service name, and slots rank code, service and account", async (t) => {
  const window = new Window({ url: "https://inventory.test/" });
  for (const path of ["tokens", "components", "application", "inventory"]) {
    const style = window.document.createElement("style");
    style.textContent = await readFile(
      new URL(`../src/styles/${path}.css`, import.meta.url),
      "utf8",
    );
    window.document.head.append(style);
  }
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.emit();
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
  // happy-dom keeps computed styles across viewport changes until the DOM changes.
  const resize = (width) => {
    window.happyDOM.setViewport({ width, height: 844 });
    window.document.body.dataset.viewport = String(width);
  };
  const computed = (node) => window.getComputedStyle(node);
  const groups = root.querySelector(".pixel-bag-window .pixel-groups");
  const slot = root.querySelector('article[data-account="empty"]');
  const name = slot.querySelector(".pixel-account-name");
  assert.ok(name.textContent === "Cloud console");
  for (const width of [320, 390, 480]) {
    resize(width);
    assert.ok(computed(groups).gridTemplateColumns === "minmax(0, 1fr)");
    assert.ok(computed(name).whiteSpace === "normal");
  }
  resize(600);
  assert.ok(
    computed(groups).gridTemplateColumns === "repeat(2, minmax(0, 1fr))",
  );
  assert.ok(computed(name).whiteSpace === "nowrap");
  resize(1280);
  const google = root.querySelector('article[data-account="google"]');
  const size = (selector) =>
    parseFloat(computed(google.querySelector(selector)).fontSize);
  assert.ok(size(".pixel-otp-value") > size(".pixel-account-name"));
  assert.ok(size(".pixel-account-name") > size(".pixel-account-address"));
  assert.ok(
    computed(google.querySelector(".pixel-account-name")).fontWeight === "700",
  );
  const ink = (selector) => computed(google.querySelector(selector)).color;
  for (const scheme of ["light", "dark"]) {
    root.querySelector(".pixel-theme").dataset.colorScheme = scheme;
    assert.ok(ink(".pixel-account-name") === ink(".pixel-otp-value"));
    assert.ok(ink(".pixel-account-address") !== ink(".pixel-account-name"));
    assert.ok(ink(".pixel-otp-next") === ink(".pixel-account-address"));
    assert.ok(ink(".pixel-next-value") === ink(".pixel-account-address"));
  }
});
