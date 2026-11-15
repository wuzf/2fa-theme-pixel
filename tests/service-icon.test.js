import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

const ICON = "/api/favicon/google.com";

function fixture(t, iconURL) {
  const window = new Window({ url: "https://service-icon.test/" });
  const document = window.document;
  const images = [];
  const createElement = document.createElement.bind(document);
  document.createElement = (name, ...rest) => {
    const node = createElement(name, ...rest);
    if (String(name).toLowerCase() === "img") images.push(node);
    return node;
  };
  const root = document.createElement("div");
  document.body.append(root);
  const mock = createSyntheticSdk();
  const google = mock.state.library.accounts.find(
    (account) => account.ref.id === "google",
  );
  if (iconURL) google.service.iconURL = iconURL;
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
  const mark = () =>
    root.querySelector('article[data-account="google"] .pixel-service-mark');
  assert.ok(mark(), "google service mark");
  const iconImages = () =>
    images.filter((image) => image.getAttribute("src") === ICON);
  return { window, mock, mark, iconImages };
}

test("shows the service icon once it loads", async (t) => {
  const h = fixture(t, ICON);
  const letter = h.mark().textContent;
  assert.equal(letter, h.mark().dataset.letter);
  assert.ok(letter.length > 0);
  assert.equal(h.mark().querySelector("img") === null, true);
  const created = h.iconImages();
  assert.ok(created.length > 0, "icon requested");
  for (const image of created) image.dispatchEvent(new h.window.Event("load"));
  const shown = h.mark().querySelector("img");
  assert.equal(shown !== null, true);
  assert.equal(shown.getAttribute("src"), ICON);
  assert.equal(shown.getAttribute("alt"), "");
  assert.equal(h.mark().classList.contains("has-icon"), true);
  assert.equal(h.mark().textContent, "");
  const before = h.iconImages().length;
  h.mock.emit();
  assert.equal(h.iconImages().length, before, "an update keeps the icon");
  assert.equal(h.mark().classList.contains("has-icon"), true);
});

test("redraws the loaded icon as a 16 by 16 sprite with hard edges", async (t) => {
  const h = fixture(t, ICON);
  const data = new Uint8ClampedArray(16 * 16 * 4);
  data.set([200, 30, 99, 200, 10, 20, 30, 40]);
  const drawn = [];
  h.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: (...args) => drawn.push(args.slice(1)),
      getImageData: () => ({ data }),
      putImageData: () => {},
    };
  };
  for (const image of h.iconImages())
    image.dispatchEvent(new h.window.Event("load"));
  const sprite = h.mark().querySelector("canvas.pixel-service-sprite");
  assert.ok(sprite, "sprite shown");
  assert.equal(h.mark().querySelector("img"), null);
  assert.equal(sprite.width, 16);
  assert.equal(sprite.height, 16);
  assert.deepEqual(drawn.at(-1), [0, 0, 16, 16]);
  // Opaque enough pixels become solid with the colour snapped to the palette;
  // faint ones become transparent.
  assert.deepEqual([...data.slice(0, 8)], [192, 32, 96, 255, 0, 32, 32, 0]);
});

test("keeps the letter when the icon cannot load", async (t) => {
  const h = fixture(t, ICON);
  const letter = h.mark().textContent;
  for (const image of h.iconImages())
    image.dispatchEvent(new h.window.Event("error"));
  assert.equal(h.mark().textContent, letter);
  assert.equal(h.mark().querySelector("img") === null, true);
  assert.equal(h.mark().classList.contains("has-icon"), false);
});

test("keeps the letter when the service has no icon", async (t) => {
  const h = fixture(t, null);
  assert.equal(h.iconImages().length, 0);
  assert.equal(h.mark().querySelector("img") === null, true);
  assert.ok(h.mark().textContent.length > 0);
});

test("a later icon change replaces the shown icon", async (t) => {
  const h = fixture(t, ICON);
  for (const image of h.iconImages())
    image.dispatchEvent(new h.window.Event("load"));
  h.mock.state.library.accounts.find(
    (account) => account.ref.id === "google",
  ).service.iconURL = undefined;
  h.mock.emit();
  assert.equal(h.mark().querySelector("img") === null, true);
  assert.equal(h.mark().classList.contains("has-icon"), false);
  assert.equal(h.mark().textContent, h.mark().dataset.letter);
});
