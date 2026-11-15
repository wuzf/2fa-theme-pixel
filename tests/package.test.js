import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import { createPublicAppearance } from "../scripts/publicAppearance.js";
import { hostAppearance } from "../src/hostAppearance.js";
import { theme } from "../theme.config.js";
const buildScript = fileURLToPath(
  new URL("../scripts/build.js", import.meta.url),
);
const output = await mkdtemp(join(tmpdir(), "pixel-package-"));
after(() => rm(output, { recursive: true, force: true }));
const archivePath = join(output, "2fa-theme.zip");
const build = () =>
  execFileSync(process.execPath, [buildScript, "--out-dir", output], {
    stdio: "pipe",
  });
build();
test("archive contains exact inventory, local assets, complete notices and no synthetic shell", async () => {
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const manifest = JSON.parse(
    new TextDecoder().decode(archive["2fa-theme.json"]),
  );
  assert.equal(manifest.themeApiVersion, 2);
  assert.equal(manifest.kind, "app");
  assert.equal(manifest.sdkApiVersion, 1);
  assert.equal(manifest.id, "pixel-for-2fa");
  assert.equal(manifest.version, "1.0.0");
  const publicFile = manifest.files.find(
    ({ path }) => path === "public-appearance.json",
  );
  assert.equal(publicFile?.mime, "application/json");
  assert.ok(publicFile.size <= 128 * 1024);
  const publicAppearance = JSON.parse(
    new TextDecoder().decode(archive[publicFile.path]),
  );
  assert.deepEqual(publicAppearance, createPublicAppearance());
  for (const font of publicAppearance.fonts) {
    const file = manifest.files.find(({ path }) => path === font.path);
    assert.equal(file?.mime, "font/woff2");
    assert.equal(
      Buffer.from(archive[font.path].subarray(0, 4)).toString(),
      "wOF2",
    );
  }
  assert.equal(Object.keys(archive).length, manifest.files.length + 1);
  for (const file of manifest.files) {
    assert.ok(archive[file.path]);
    assert.equal(archive[file.path].length, file.size);
    assert.equal(
      createHash("sha256").update(archive[file.path]).digest("hex"),
      file.sha256,
    );
  }
  assert.ok(
    !Object.keys(archive).some(
      (path) => path.startsWith("dev/") || path.endsWith(".html"),
    ),
  );
  for (const name of [
    "silkscreen-OFL",
    "fusion-pixel-OFL",
    "Pixel-MIT",
    "NOTICE",
  ])
    assert.ok(archive[`licenses/${name}.txt`]);
});
test("bundled third-party assets retain original bytes and build is reproducible", async () => {
  const before = await readFile(archivePath);
  build();
  const after = await readFile(archivePath);
  assert.deepEqual(after, before);
  const archive = unzipSync(new Uint8Array(after));
  for (const name of [
    "landscape-valley.webp",
    "landscape-outpost.webp",
    "silkscreen-latin-400-normal.woff2",
    "fusion-pixel-12px-proportional-sc-latin-400-normal.woff2",
  ])
    assert.deepEqual(
      Buffer.from(archive["assets/" + name]),
      await readFile(new URL("../assets/" + name, import.meta.url)),
    );
});

const hostIntegration = process.env.HOST_ROOT ? test : test.skip;
hostIntegration(
  "real host validates the public descriptor, resolves settings and only exposes used same-package fonts",
  async () => {
    const { normalizeAppThemeImport, normalizeAppAppearance } = await import(
      pathToFileURL(resolve(process.env.HOST_ROOT, "src/themes/appPackage.js"))
        .href
    );
    const { resolvePublicAppearance } = await import(
      pathToFileURL(
        resolve(process.env.HOST_ROOT, "src/themes/publicAppearance.js"),
      ).href
    );
    const pkg = await normalizeAppThemeImport({
      bytes: new Uint8Array(await readFile(archivePath)),
    });
    assert.deepEqual(pkg.publicAppearanceDescriptor, createPublicAppearance());
    const defaults = Object.fromEntries(
      theme.settings.map((field) => [field.key, field.default]),
    );
    const publicFamily = `2fa-public-${pkg.packageId}-0`;
    for (const accent of ["green", "violet", "rose"])
      for (const pixelChinese of [false, true]) {
        const settings = { ...defaults, accent, pixelChinese };
        const result = resolvePublicAppearance(pkg, settings);
        assert.deepEqual(
          Object.keys(result).sort(),
          ["formatVersion", "packageId", "light", "dark", "fonts"].sort(),
        );
        for (const [mode, dark] of [
          ["light", false],
          ["dark", true],
        ]) {
          const actual = structuredClone(result[mode]);
          actual.fontFamily = actual.fontFamily.map((family) =>
            family === publicFamily ? "Pixel2FA Text" : family,
          );
          assert.deepEqual(actual, hostAppearance(settings, dark));
        }
        assert.equal(result.fonts.length, pixelChinese ? 1 : 0);
        if (pixelChinese) {
          const face = result.fonts[0];
          const source = pkg.files.find((file) => file.path === face.path);
          assert.equal(face.family, publicFamily);
          assert.equal(
            face.url,
            `/theme-packages/${pkg.packageId}/${face.path}`,
          );
          assert.equal(face.hash, source.hash);
          assert.equal(face.size, source.size);
          assert.equal(face.weight, 400);
          assert.equal(face.style, "normal");
        }
      }
    const selected = { ...defaults, accent: "rose", pixelChinese: true };
    const normalized = await normalizeAppAppearance(pkg, {
      settings: selected,
    });
    assert.deepEqual(
      normalized.appearance.publicAppearance,
      resolvePublicAppearance(pkg, selected),
    );
    const previewBase = "/theme-preview/" + "a".repeat(64) + "/";
    const preview = resolvePublicAppearance(pkg, selected, {
      baseUrl: previewBase,
    });
    assert.equal(preview.fonts[0].url, previewBase + preview.fonts[0].path);
  },
);
