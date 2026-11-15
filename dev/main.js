import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "./synthetic-sdk.js";
const shell = createSyntheticSdk({
  onCall(method, value) {
    document.querySelector("#dev-output").textContent =
      method +
      "\n" +
      JSON.stringify(
        value,
        (key, item) => (key === "options" ? undefined : item),
        2,
      );
  },
});
// The real host advances sdk.clock and rotates codes every period; the
// synthetic fixture is frozen one second before its codes expire, so the
// shell follows wall time and derives fresh synthetic codes each window.
shell.sdk.clock.now = () => Date.now();
let lastWindow = -1;
function advanceDemo() {
  const period = Math.floor(Date.now() / 30000);
  if (period === lastWindow) return;
  lastWindow = period;
  shell.state.clock.correctedNow = Date.now();
  for (const [index, account] of shell.state.library.accounts.entries()) {
    if (account.type === "HOTP") continue;
    for (const [slot, offset] of [
      ["current", 0],
      ["next", 1],
    ]) {
      const code = account.otp[slot];
      if (!code) continue;
      code.value = String(
        (period + offset + (index + 1) * 148329) % 10 ** account.digits,
      ).padStart(account.digits, "0");
      code.validFrom = (period + offset) * 30000;
      code.validUntil = (period + offset + 1) * 30000;
    }
    account.otp.displayRevision += 1;
  }
  shell.emit();
}
advanceDemo();
const app = mount({
  root: document.querySelector("#app"),
  sdk: shell.sdk,
  appearance: {
    package: { id: "pixel-for-2fa", name: "Pixel", version: "1.0.0" },
    settings: {
      landscape: "valley",
      density: "comfortable",
      accent: "green",
      pixelChinese: true,
    },
  },
});
const timer = window.setInterval(advanceDemo, 1000);
window.addEventListener(
  "pagehide",
  () => {
    window.clearInterval(timer);
    app.unmount();
  },
  { once: true },
);
