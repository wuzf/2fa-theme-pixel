import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}) {
  const window = new Window({ url: "https://pixel.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  configure(mock);
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  return { root, mock };
}
const about = (root) => root.querySelector(".pixel-footer .pixel-footer-about");

// The official footer is replaced by the theme; the theme carries what it showed.
test("the footer shows the 2FA version and the project links", (t) => {
  const { root, mock } = fixture(t);
  const row = about(root);
  assert.ok(row, "the footer has an about row");
  assert.equal(row.hidden, false);
  assert.equal(
    row.querySelector(".pixel-footer-version").textContent,
    "2FA v1.13.1",
  );
  assert.equal(row.querySelector(".pixel-footer-update").hidden, true);
  const links = [...row.querySelectorAll("a.pixel-footer-link")];
  assert.deepEqual(
    links.map((link) => [link.textContent, link.getAttribute("href")]),
    [
      ["Documentation", "https://github.com/wuzf/2fa/blob/main/README.md"],
      ["Report an issue", "https://github.com/wuzf/2fa/issues"],
      ["Source code", "https://github.com/wuzf/2fa"],
    ],
  );
  for (const link of links) {
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
  }
  const extension = row.querySelector(
    'button[data-action="host"][data-value="extension"]',
  );
  assert.equal(extension.textContent, "Browser extension");
  assert.equal(extension.hidden, false);
  extension.click();
  assert.deepEqual(
    mock.calls.filter((call) => call.method === "host.open").at(-1).value
      .request,
    { kind: "extension" },
  );
});

test("a newer release shows a link to it, and goes when there is none", (t) => {
  const { root, mock } = fixture(t);
  mock.state.host.about = {
    ...mock.state.host.about,
    latestVersion: "1.14.0",
    upToDate: false,
  };
  mock.emit();
  const update = about(root).querySelector(".pixel-footer-update");
  assert.equal(update.hidden, false);
  assert.equal(update.textContent, "🆕 New version available: v1.14.0");
  assert.equal(
    update.getAttribute("href"),
    "https://github.com/wuzf/2fa/releases/latest",
  );
  assert.equal(update.target, "_blank");
  assert.equal(update.rel, "noopener noreferrer");
  mock.state.host.about = { ...mock.state.host.about, latestVersion: null };
  mock.emit();
  assert.equal(update.hidden, true);
});

test("a missing link or extension action leaves only what exists", (t) => {
  const { root, mock } = fixture(t);
  const listActions = mock.sdk.host.listActions;
  mock.sdk.host.listActions = () =>
    listActions().filter((item) => item.actionId !== "extension");
  const { feedback: _feedback, ...links } = mock.state.host.about.links;
  mock.state.host.about = { ...mock.state.host.about, links };
  mock.emit();
  const row = about(root);
  assert.equal(
    row.querySelector('button[data-value="extension"]').hidden,
    true,
  );
  assert.deepEqual(
    [...row.querySelectorAll("a.pixel-footer-link")]
      .filter((link) => !link.hidden)
      .map((link) => link.textContent),
    ["Documentation", "Source code"],
  );
});

test("a host without version data shows no version line", (t) => {
  const { root } = fixture(t, (mock) => {
    delete mock.state.host.about;
  });
  assert.equal(about(root).hidden, true);
});

// Rules with the at-rules around them and their declarations, from plain CSS text.
async function styleRules() {
  const dir = new URL("../src/styles/", import.meta.url);
  const out = [];
  for (const file of (await readdir(dir)).filter((name) =>
    name.endsWith(".css"),
  )) {
    const text = (await readFile(new URL(file, dir), "utf8")).replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const stack = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        stack.push({ prelude: text.slice(start, i).trim(), body: i + 1 });
        start = i + 1;
      } else if (text[i] === "}") {
        const rule = stack.pop();
        if (rule && !rule.prelude.startsWith("@"))
          out.push({
            selectors: rule.prelude.split(",").map((item) => item.trim()),
            within: stack.map((item) => item.prelude),
            body: text.slice(rule.body, i).replace(/\s+/g, " "),
          });
        start = i + 1;
      }
    }
  }
  return out;
}

// On a phone the four links wrapped one by one and left a single link on a line.
test("on phones the links form two equal columns under the version", async (t) => {
  const { root } = fixture(t);
  const list = about(root).querySelector(".pixel-footer-links");
  assert.ok(list, "the links have their own block");
  assert.deepEqual(
    [...list.children].map((node) => node.textContent),
    ["Documentation", "Browser extension", "Report an issue", "Source code"],
  );
  assert.equal(
    about(root).firstElementChild,
    about(root).querySelector(".pixel-footer-version"),
  );
  const rules = await styleRules();
  const phone = rules.filter(
    (rule) =>
      rule.selectors.includes(".pixel-theme .pixel-footer-links") &&
      rule.within.some((at) => /^@media\s*\(max-width:\s*600px\)$/.test(at)),
  );
  assert.ok(
    phone.some(
      (rule) =>
        /display: grid;/.test(rule.body) &&
        /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(rule.body),
    ),
    "a two-column grid up to 600px",
  );
  // A hidden link takes no grid cell.
  assert.ok(
    rules.some(
      (rule) =>
        rule.selectors.includes(".pixel-theme [hidden]") &&
        /display: none !important;/.test(rule.body),
    ),
  );
  // Wider screens keep one row: the block adds no box of its own.
  assert.ok(
    rules.some(
      (rule) =>
        rule.within.length === 0 &&
        rule.selectors.includes(".pixel-theme .pixel-footer-links") &&
        /display: contents;/.test(rule.body),
    ),
  );
});
