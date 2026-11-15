import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { theme } from "../theme.config.js";
import { createPublicAppearance } from "./publicAppearance.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out-dir" || !args[1]))
  throw new Error("Usage: node scripts/build.js [--out-dir <directory>]");
const output = args.length ? resolve(args[1]) : resolve(root, "dist");
const mime = {
  js: "text/javascript",
  css: "text/css",
  webp: "image/webp",
  woff2: "font/woff2",
  txt: "text/plain",
  json: "application/json",
};
const entries = {};
async function add(path, data) {
  entries[path] = new Uint8Array(data);
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}
async function collect(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else await add(path, await readFile(resolve(root, path)));
  }
}
await mkdir(output, { recursive: true });
await collect("src");
await add("preview.webp", await readFile(resolve(root, "preview.webp")));
await collect("assets");
await collect("licenses");
await add(
  "public-appearance.json",
  Buffer.from(JSON.stringify(createPublicAppearance(), null, 2) + "\n"),
);
await add("licenses/Pixel-MIT.txt", await readFile(resolve(root, "LICENSE")));
await add("licenses/NOTICE.txt", await readFile(resolve(root, "NOTICE.md")));
const files = Object.entries(entries)
  .sort(([a], [b]) => a.localeCompare(b, "en"))
  .map(([path, bytes]) => ({
    path,
    mime: mime[path.split(".").pop()],
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
if (files.some((file) => !file.mime))
  throw new Error("Unsupported packaged file");
const manifest = { ...theme, files };
await add(
  "2fa-theme.json",
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
);
const archive = zipSync(
  Object.fromEntries(
    Object.entries(entries).map(([name, bytes]) => [
      name,
      [bytes, { mtime: new Date("2026-01-01T00:00:00Z") }],
    ]),
  ),
  { level: 6 },
);
await writeFile(resolve(output, "2fa-theme.zip"), archive);
const digest = createHash("sha256").update(archive).digest("hex");
await writeFile(
  resolve(output, "2fa-theme.zip.sha256"),
  digest + "  2fa-theme.zip\n",
);
console.log(
  JSON.stringify(
    {
      archive: relative(root, resolve(output, "2fa-theme.zip"))
        .split(sep)
        .join("/"),
      files: files.length + 1,
      bytes: archive.length,
      sha256: digest,
    },
    null,
    2,
  ),
);
