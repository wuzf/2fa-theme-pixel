import { hostAppearance } from "../src/hostAppearance.js";
import { theme } from "../theme.config.js";

const publicSettings = ["accent", "pixelChinese"];

/** Build-time data only: public pages never load the theme's JavaScript. */
export function createPublicAppearance() {
  const defaults = Object.fromEntries(
    theme.settings.map(({ key, default: value }) => [key, value]),
  );
  const baseline = {
    light: hostAppearance(defaults, false),
    dark: hostAppearance(defaults, true),
  };
  const variants = publicSettings.map((key) => {
    const field = theme.settings.find((setting) => setting.key === key);
    if (!field || !["boolean", "select"].includes(field.type))
      throw new Error(`Unsupported public appearance setting: ${key}`);
    const values =
      field.type === "boolean"
        ? [false, true]
        : field.options.map(({ value }) => value);
    return {
      setting: key,
      values: Object.fromEntries(
        values.map((value) => [
          String(value),
          Object.fromEntries(
            ["light", "dark"].map((mode) => [
              mode,
              Object.fromEntries(
                Object.entries(
                  hostAppearance(
                    { ...defaults, [key]: value },
                    mode === "dark",
                  ),
                ).filter(
                  ([token, next]) =>
                    JSON.stringify(next) !==
                    JSON.stringify(baseline[mode][token]),
                ),
              ),
            ]),
          ),
        ]),
      ),
    };
  });
  return {
    formatVersion: 1,
    ...baseline,
    fonts: [
      {
        family: "Pixel2FA Text",
        path: "assets/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2",
        weight: 400,
        style: "normal",
      },
    ],
    variants,
  };
}
