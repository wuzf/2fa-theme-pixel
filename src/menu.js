/** The management menu, laid out like a game menu: the inventory (accounts
    and data), items (tools), system (settings) and more. */
export const toolIds = [
  "tool:qr-decode",
  "tool:qr-generate",
  "tool:base32",
  "tool:timestamp",
  "tool:key-check",
  "tool:key-generate",
];
export const providerIds = [
  "sync-provider:webdav",
  "sync-provider:s3",
  "sync-provider:onedrive",
  "sync-provider:gdrive",
];
/** Each group's entries in menu order. "*" marks where an action the theme
    does not know yet goes, so a new host action is never lost. Scanning opens
    the inventory, About follows the theme settings and signing out closes the
    menu. "scheme" is the theme's own light/dark switch. */
export const groupOrder = {
  data: ["scan-import", "account-add", "import", "export", "backup", "*"],
  tools: ["tools", ...toolIds, "*", "quick-otp"],
  settings: [
    "scheme",
    "settings:security",
    "settings:sync",
    ...providerIds,
    "settings:preferences",
    "settings:custom-code",
    "*",
    "appearance",
    "settings:about",
  ],
  application: ["extension", "pwa-install", "*", "login", "logout"],
};
/** An unknown action joins the group its family belongs to, else "more". */
export function groupOf(actionId) {
  for (const [group, ids] of Object.entries(groupOrder))
    if (ids.includes(actionId)) return group;
  if (/^(settings|sync-provider):/.test(actionId)) return "settings";
  if (actionId.startsWith("tool:")) return "tools";
  return "application";
}
export function menuRank(group, actionId) {
  const ids = groupOrder[group];
  const index = ids.indexOf(actionId);
  return index < 0 ? ids.indexOf("*") : index;
}
