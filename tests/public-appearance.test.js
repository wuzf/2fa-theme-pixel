import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicAppearance } from "../scripts/publicAppearance.js";
import { hostAppearance } from "../src/hostAppearance.js";
import { theme } from "../theme.config.js";

const description = createPublicAppearance();
const defaults = Object.fromEntries(
  theme.settings.map(({ key, default: value }) => [key, value]),
);
const combinations = theme.settings.reduce(
  (current, field) =>
    current.flatMap((settings) =>
      (field.type === "boolean"
        ? [false, true]
        : field.options.map(({ value }) => value)
      ).map((value) => ({ ...settings, [field.key]: value })),
    ),
  [{}],
);

test("public data resolves to runtime tokens for every declared setting combination", () => {
  assert.equal(combinations.length, 36);
  for (const settings of combinations) {
    for (const mode of ["light", "dark"]) {
      const resolved = { ...description[mode] };
      for (const variant of description.variants)
        Object.assign(
          resolved,
          variant.values[String(settings[variant.setting])][mode],
        );
      assert.deepEqual(
        resolved,
        hostAppearance(settings, mode === "dark"),
        JSON.stringify({ settings, mode }),
      );
    }
  }
  assert.deepEqual(description.light, hostAppearance(defaults, false));
  assert.deepEqual(description.dark, hostAppearance(defaults, true));
});

test("public descriptor contains only finite visual variants within the public budget", () => {
  assert.deepEqual(Object.keys(description), [
    "formatVersion",
    "light",
    "dark",
    "fonts",
    "variants",
  ]);
  assert.equal(description.formatVersion, 1);
  assert.deepEqual(
    description.variants.map(({ setting }) => setting),
    ["accent", "pixelChinese"],
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(description, null, 2)) < 128 * 1024,
  );
  for (const variant of description.variants) {
    const field = theme.settings.find(({ key }) => key === variant.setting);
    assert.deepEqual(
      Object.keys(variant.values).sort(),
      (field.type === "boolean"
        ? ["false", "true"]
        : field.options.map(({ value }) => value)
      ).sort(),
    );
    assert.ok(Object.keys(variant.values).length <= 16);
    for (const tokens of Object.values(variant.values))
      assert.deepEqual(Object.keys(tokens), ["light", "dark"]);
  }
});

test("public font matches the runtime text face and excludes unused display typography", async () => {
  assert.deepEqual(description.fonts, [
    {
      family: "Pixel2FA Text",
      path: "assets/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2",
      weight: 400,
      style: "normal",
    },
  ]);
  const css = await readFile(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  for (const font of description.fonts) {
    const face = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].find(
      ([, rules]) => rules.includes(`font-family: "${font.family}"`),
    );
    assert.ok(face);
    assert.ok(face[1].includes(`../../${font.path}`));
    assert.match(face[1], /font-weight:\s*400/);
    assert.match(face[1], /font-style:\s*normal/);
    assert.doesNotMatch(face[1], /unicode-range/);
    const bytes = await readFile(new URL(`../${font.path}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
  }
  // Pixel typography is on by default; turning it off drops the pixel face.
  // Variants list only the tokens that differ from the defaults.
  assert.ok(description.light.fontFamily.includes("Pixel2FA Text"));
  assert.ok(
    !description.variants[1].values.false.light.fontFamily.includes(
      "Pixel2FA Text",
    ),
  );
  assert.equal(description.variants[1].values.true.light.fontFamily, undefined);
});
