import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { theme } from "../theme.config.js";

test("ships a small WebP screenshot as the editor preview", async () => {
  assert.equal(theme.preview, "preview.webp");
  const bytes = await readFile(new URL("../preview.webp", import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP");
  assert.ok(bytes.length < 64 * 1024, `preview is ${bytes.length} bytes`);
});
