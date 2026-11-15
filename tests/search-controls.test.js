import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t) {
  const window = new Window({ url: "https://theme-search.test/" });
  const document = window.document;
  const login = document.createElement("form");
  const password = document.createElement("input");
  password.type = "password";
  login.append(password);
  const unrelatedSearch = document.createElement("input");
  unrelatedSearch.type = "search";
  const root = document.createElement("main");
  document.body.append(login, unrelatedSearch, root);
  const mock = createSyntheticSdk();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings: {} },
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return { window, document, login, unrelatedSearch, root, mock, app };
}

test("search belongs to a dedicated non-login form and Enter never submits navigation", (t) => {
  const h = fixture(t);
  const search = h.root.querySelector('input[type="search"]');
  const form = search.form;
  assert.ok(
    form,
    "search has an explicit form owner, separate from login fields",
  );
  assert.notEqual(form, h.login);
  assert.equal(form.getAttribute("role"), "search");
  assert.equal(form.autocomplete, "off");
  assert.equal(form.querySelectorAll('input[type="password"]').length, 0);
  assert.equal(search.name, "account-search");
  assert.equal(search.autocomplete, "off");
  assert.equal(search.getAttribute("autocapitalize"), "none");
  assert.equal(search.getAttribute("autocorrect"), "off");
  assert.equal(search.spellcheck, false);
  assert.equal(search.readOnly, false);
  assert.ok(search.getAttribute("aria-label"));
  assert.equal(form.querySelectorAll('[data-action="clear"]').length, 1);
  const beforeSubmit = h.mock.calls.length;
  const submit = new h.window.Event("submit", {
    bubbles: true,
    cancelable: true,
  });
  assert.equal(form.dispatchEvent(submit), false);
  assert.equal(submit.defaultPrevented, true);
  assert.equal(h.mock.calls.length, beforeSubmit);
  h.app.unmount();
  const afterUnmount = new h.window.Event("submit", {
    bubbles: true,
    cancelable: true,
  });
  assert.equal(
    form.dispatchEvent(afterUnmount),
    true,
    "submit listener is removed with the mounted theme",
  );
});

test("IME search and the single clear action keep filtering and focus behavior", (t) => {
  const h = fixture(t);
  const search = h.root.querySelector('input[type="search"]');
  const service = h.root.querySelector('[data-setting="service"]');
  const selected = h.mock.sdk.getSnapshot().library.view.services[0].groupId;
  service.value = selected;
  service.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  service.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(h.mock.calls.at(-1).method, "view.setServiceFilter");
  const beforeComposition = h.mock.calls.length;
  search.focus();
  search.value = "Goo";
  search.dispatchEvent(
    new h.window.InputEvent("input", { bubbles: true, isComposing: true }),
  );
  assert.equal(
    h.mock.calls.length,
    beforeComposition,
    "unfinished composition is not submitted",
  );
  search.dispatchEvent(
    new h.window.CompositionEvent("compositionend", { bubbles: true }),
  );
  assert.equal(h.mock.calls.at(-1).method, "view.setQuery");
  assert.deepEqual(h.mock.calls.at(-1).value, { query: "Goo" });
  const clear = h.root.querySelector('[data-action="clear"]');
  assert.equal(clear.hidden, false);
  clear.focus();
  clear.click();
  assert.deepEqual(
    h.mock.calls.slice(-2).map((call) => [call.method, call.value]),
    [
      ["view.setQuery", { query: "" }],
      ["view.setServiceFilter", { serviceFilter: null }],
    ],
  );
  assert.equal(search.value, "");
  assert.equal(h.document.activeElement, search);
  assert.equal(h.root.querySelectorAll('[data-action="clear"]').length, 1);
});

test("native search clear decoration is disabled only for this theme search", (t) => {
  const h = fixture(t);
  const search = h.root.querySelector('input[type="search"]');
  const sheet = new h.window.CSSStyleSheet();
  sheet.replaceSync(
    readFileSync(
      new URL("../src/styles/components.css", import.meta.url),
      "utf8",
    ),
  );
  const rules = [...sheet.cssRules].filter((rule) =>
    rule.selectorText?.includes("::-webkit-search-cancel-button"),
  );
  assert.ok(rules.length, "custom clear replaces the browser cancel glyph");
  for (const rule of rules) {
    assert.equal(rule.style.getPropertyValue("display"), "none");
    assert.equal(rule.style.getPropertyValue("appearance"), "none");
    for (const selector of rule.selectorText.split(",")) {
      const owner = selector
        .trim()
        .replace(/::-webkit-search-(?:cancel-button|decoration)$/, "");
      assert.equal(search.matches(owner), true);
      assert.equal(
        h.unrelatedSearch.matches(owner),
        false,
        "other host searches keep their native presentation",
      );
      assert.equal(h.login.querySelector("input").matches(owner), false);
    }
  }
});
