export const theme = {
  themeApiVersion: 2,
  kind: "app",
  sdkApiVersion: 1,
  id: "pixel-for-2fa",
  name: "Pixel",
  version: "1.0.0",
  author: "2FA Theme Contributors",
  description:
    "An RPG inventory authenticator: item slots, category tabs, an inspect dialog with an HP timer and pixel landscapes.",
  entry: "src/theme.js",
  preview: "preview.webp",
  styles: [
    "src/styles/tokens.css",
    "src/styles/components.css",
    "src/styles/application.css",
    "src/styles/inventory.css",
  ],
  capabilities: ["accounts", "host-flows", "preferences"],
  settings: [
    {
      key: "landscape",
      type: "select",
      label: "像素景观 / Landscape",
      default: "valley",
      options: [
        { value: "valley", label: "山谷 / Valley" },
        { value: "outpost", label: "前哨 / Outpost" },
        { value: "none", label: "关闭 / Off" },
      ],
    },
    {
      key: "density",
      type: "select",
      label: "信息密度 / Density",
      default: "comfortable",
      options: [
        { value: "comfortable", label: "舒适 / Comfortable" },
        { value: "compact", label: "紧凑 / Compact" },
      ],
    },
    {
      key: "accent",
      type: "select",
      label: "强调色 / Accent",
      default: "green",
      options: [
        { value: "green", label: "草绿 / Meadow" },
        { value: "violet", label: "紫罗兰 / Violet" },
        { value: "rose", label: "玫瑰 / Rose" },
      ],
    },
    {
      key: "pixelChinese",
      type: "boolean",
      label: "像素中文 / Pixel typography",
      default: true,
    },
  ],
};
