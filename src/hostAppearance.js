/** Optional host chrome. This mirrors the theme palette without reading computed CSS. */
export function hostAppearance(settings = {}, dark = false) {
  const accent = ["green", "violet", "rose"].includes(settings.accent)
    ? settings.accent
    : "green";
  // The host also uses accent as text; use the readable ink accent, not pastel fill.
  const accentColor = {
    green: dark ? "#91d596" : "#247942",
    violet: dark ? "#d3b9f6" : "#68418e",
    rose: dark ? "#f5b4c2" : "#9b3954",
  }[accent];
  const selected = {
    green: dark ? "#273d2e" : "#e2efda",
    violet: dark ? "#3c2e50" : "#ece3f8",
    rose: dark ? "#4b2d36" : "#f9e1e5",
  }[accent];
  const accentHover = {
    green: dark ? "#b1e1b5" : "#1c6134",
    violet: dark ? "#e4d0fc" : "#543372",
    rose: dark ? "#ffd0da" : "#7e2e43",
  }[accent];
  const shadow = dark ? "#08080d" : "#20241d";
  return {
    surface: dark ? "#1c2320" : "#fbfcf4",
    subtle: dark ? "#131816" : "#edf0e2",
    hover: dark ? "#34343e" : "#dbe1cc",
    text: dark ? "#e3eadb" : "#20241d",
    muted: dark ? "#b2aea3" : "#625e56",
    line: dark ? "#e3eadb" : "#20241d",
    stroke: dark ? "#e3eadb" : "#20241d",
    accent: accentColor,
    accentHover,
    accentText: dark ? "#20241d" : "#ffffff",
    selected,
    danger: dark ? "#ffa49a" : "#b22b2b",
    dangerBackground: dark ? "#482b2d" : "#fbe4df",
    dangerFill: dark ? "#ffa49a" : "#b22b2b",
    dangerFillHover: dark ? "#ffc3bc" : "#932323",
    dangerText: dark ? "#20241d" : "#ffffff",
    warning: dark ? "#f3ce74" : "#805800",
    warningBackground: dark ? "#3c3320" : "#fbefca",
    success: dark ? "#91d596" : "#247942",
    successBackground: dark ? "#273d2e" : "#e2efda",
    radius: 0,
    controlRadius: 0,
    borderWidth: 2,
    shadow: { x: 4, y: 4, blur: 0, spread: 0, color: shadow },
    controlShadow: null,
    fontFamily:
      settings.pixelChinese !== false
        ? [
            "Pixel2FA Text",
            "ui-sans-serif",
            "system-ui",
            "PingFang SC",
            "Microsoft YaHei",
            "sans-serif",
          ]
        : [
            "ui-sans-serif",
            "system-ui",
            "-apple-system",
            "PingFang SC",
            "Microsoft YaHei",
            "sans-serif",
          ],
  };
}
