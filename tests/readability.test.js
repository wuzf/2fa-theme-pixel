import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { theme } from "../theme.config.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

async function fixture(t, { settings = {}, services = 0 } = {}) {
  const window = new Window({ url: "https://readability.test/" });
  const style = window.document.createElement("style");
  style.textContent = (await Promise.all(theme.styles.map(read))).join("\n");
  window.document.head.append(style);
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  if (services) {
    const template = mock.state.library.accounts[0];
    mock.state.library.accounts = Array.from({ length: services }, (_, i) => ({
      ...structuredClone(template),
      ref: { id: `account-${i}`, generation: 1 },
      service: { label: `Service ${i}`, groupId: `service-${i}` },
    }));
  }
  mock.emit();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings },
    signal: new AbortController().signal,
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return { window, root, app, mock };
}

test("every service has a tab, not only the first six", async (t) => {
  const h = await fixture(t, { services: 9 });
  const tabs = [...h.root.querySelectorAll('.pixel-tabs [data-action="tab"]')];
  assert.equal(tabs.length, 10);
  tabs.at(-1).click();
  assert.equal(
    h.mock.sdk.getSnapshot().library.view.serviceFilter,
    "service-8",
  );
  assert.equal(
    h.root
      .querySelector('.pixel-tabs [aria-pressed="true"]')
      .textContent.startsWith("Service 8"),
    true,
  );
});

test("a mouse wheel scrolls an overflowing tab strip sideways, then lets the page scroll", async (t) => {
  const h = await fixture(t, { services: 9 });
  const strip = h.root.querySelector(".pixel-tabs");
  Object.defineProperty(strip, "scrollWidth", { value: 900 });
  Object.defineProperty(strip, "clientWidth", { value: 300 });
  let left = 0;
  Object.defineProperty(strip, "scrollLeft", {
    get: () => left,
    set: (value) => (left = Math.max(0, Math.min(600, value))),
  });
  const wheel = (deltaY, deltaMode = 0) => {
    const event = new h.window.WheelEvent("wheel", {
      deltaY,
      deltaMode,
      bubbles: true,
      cancelable: true,
    });
    strip.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(wheel(120), true);
  assert.equal(left, 120);
  assert.equal(wheel(-500), true);
  assert.equal(left, 0);
  // At the start already: the wheel goes back to the page.
  assert.equal(wheel(-100), false);
  // A wheel that counts in lines moves the strip as far as one in pixels.
  assert.equal(wheel(3, 1), true);
  assert.equal(left, 48);
});

test("pixel text stays on its 12px grid and is never bolded", async (t) => {
  const h = await fixture(t, { settings: { pixelChinese: true } });
  const surface = h.root.querySelector(".pixel-theme");
  assert.equal(h.window.getComputedStyle(surface).fontSize, "12px");
  const css = await read("src/styles/inventory.css");
  assert.match(css, /\.pixel-theme \{\s*font-synthesis: none;/);
  // happy-dom ranks :is() below the rules it overrides, so these are checked as
  // written; the browser check measured 12px regular text and 24px titles.
  const rule = (prefix) =>
    css.match(
      new RegExp(
        String.raw`\.pixel-theme\[data-pixel-text="true"\]\s+${prefix}:is\(([^)]*)\)\s*\{([^}]*)\}`,
      ),
    );
  const text = rule("");
  for (const name of ["tab", "group-title", "expiry-label strong"])
    assert.match(text[1], new RegExp(String.raw`\.pixel-${name},`));
  assert.match(text[2], /font-size: 12px;\s*font-weight: 400;/);
  const slots = rule(String.raw`\.pixel-bag-window\s+\.pixel-account-grid\s+`);
  for (const name of ["account-name", "account-address", "expiry-label"])
    assert.match(slots[1], new RegExp(String.raw`\.pixel-${name}\b`));
  assert.match(slots[2], /font-size: 12px;\s*font-weight: 400;/);
  assert.match(
    css,
    /:is\(\.pixel-section-title, \.pixel-dialog-title, \.pixel-group-toggle\) \{\s*font-size: 24px;\s*font-weight: 400;/,
  );
});

test("system text keeps its sizes when pixel text is off", async (t) => {
  const h = await fixture(t, { settings: { pixelChinese: false } });
  const tab = h.window.getComputedStyle(
    h.root.querySelector('.pixel-tab[aria-pressed="true"]'),
  );
  assert.equal(tab.fontSize, "13px");
  assert.equal(tab.fontWeight, "700");
});

const luminance = (hex) =>
  hex
    .match(/\w\w/g)
    .map((part) => parseInt(part, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("light timer bars stand out from their track for every accent", async () => {
  const tokens = await read("src/styles/tokens.css");
  const application = await read("src/styles/application.css");
  const light = tokens.slice(0, tokens.indexOf('[data-color-scheme="dark"]'));
  const value = (css, name) =>
    css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))[1];
  const track = value(light, "pixel-track");
  const fills = [
    value(light, "pixel-progress-fill"),
    value(light, "pixel-progress-amber"),
    ...[...application.matchAll(/--pixel-progress-fill: (#[0-9a-f]{6});/g)].map(
      (match) => match[1],
    ),
  ];
  assert.equal(fills.length, 4);
  for (const fill of fills)
    assert.ok(contrast(fill, track) >= 3, `${fill} on ${track}`);
  const components = await read("src/styles/components.css");
  assert.match(components, /var\(--pixel-progress-fill\) 0 13px/);
  assert.match(components, /var\(--pixel-progress-amber\) 0 13px/);
});

test("compact slots put the account and the next code on shared lines", async (t) => {
  const comfortable = await fixture(t);
  const compact = await fixture(t, { settings: { density: "compact" } });
  const style = (h, selector) =>
    h.window.getComputedStyle(h.root.querySelector(selector));
  assert.ok(
    parseFloat(style(compact, ".pixel-card").paddingTop) <
      parseFloat(style(comfortable, ".pixel-card").paddingTop),
  );
  assert.equal(
    style(comfortable, ".pixel-account-identity").display,
    "contents",
  );
  assert.equal(style(compact, ".pixel-account-identity").display, "flex");
  assert.equal(style(compact, ".pixel-codes").display, "flex");
  // The card-era compact rules, which the slots overrode, are gone.
  assert.doesNotMatch(
    await read("src/styles/application.css"),
    /data-density="compact"/,
  );
});
