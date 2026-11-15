import { hostText, localText } from "./i18n.js";
import { groupOf, menuRank, providerIds, toolIds } from "./menu.js";
import { hostAppearance } from "./hostAppearance.js";

let disclosureSequence = 0;

/** Complete frontend. The host SDK remains the only account/OTP/command authority. */
export function mount({ root, sdk, appearance = {}, signal }) {
  if (!root || !sdk || signal?.aborted) return { update() {}, unmount() {} };
  const document = root.ownerDocument;
  const window = document.defaultView;
  let live = true;
  let snapshot = sdk.getSnapshot();
  let currentAppearance = appearance;
  let lang = snapshot.preferences.resolvedLanguage || "en";
  let menuId = null;
  let unsubscribe = () => {};
  let lastStructure = "";
  let lastChrome = "";
  const stateNodes = new Map();
  const featureNodes = new Map();
  let activeManagementGroup = "data";
  const cards = new Map();
  const groups = new Map();
  let lastHostAppearance = "";
  let noticeTimer = null;
  let noticeGeneration = 0;
  let noticeSequence = 0;
  let noticeRoute = window.location.hash;
  const operationRows = new Map();
  const queueRows = new Map();
  const animations = new Map();
  const local = (key) => localText(lang, key);
  const t = (key, fallback, params) => hostText(sdk, key, fallback, params);
  const el = (tag, className = "", text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function button(text, action, className = "pixel-button", value) {
    const node = el("button", className, text);
    node.type = "button";
    node.dataset.action = action;
    if (value !== undefined) node.dataset.value = value;
    return node;
  }
  function labelSelect(key) {
    const label = el("label", "pixel-select-field");
    const title = el("span");
    const select = el("select", "pixel-input");
    select.dataset.setting = key;
    label.append(title, select);
    return { label, title, select };
  }
  function options(select, choices, value) {
    const signature = JSON.stringify(choices);
    if (select.dataset.options !== signature) {
      select.replaceChildren(
        ...choices.map(([id, label]) => {
          const option = el("option", "", label);
          option.value = id;
          return option;
        }),
      );
      select.dataset.options = signature;
    }
    if (select.value !== value) select.value = value;
  }
  const surface = el("div", "pixel-theme");
  const skip = button("", "skip", "pixel-skip-link");
  const header = el("header", "pixel-topbar");
  const head = el("div", "pixel-topbar-inner");
  // App bar: the menu (Manage) on the left, the title in the middle and search
  // on the right. Search opens in place of the title.
  const brand = el("div", "pixel-brand");
  const identity = el("div");
  const brandName = el("h1", "pixel-brand-name pixel-display", "2FA");
  identity.append(brandName);
  brand.append(identity);
  const headerActions = el("nav", "pixel-actions pixel-topbar-actions");
  const scheme = button("", "scheme", "pixel-button is-quiet");
  const more = button("", "route", "pixel-button is-quiet", "more");
  const moreIcon = el("span", "pixel-bar-icon is-menu");
  moreIcon.setAttribute("aria-hidden", "true");
  const moreLabel = el("span", "pixel-sr-only");
  more.append(moreIcon, moreLabel);
  headerActions.append(more);
  const headTools = el("div", "pixel-topbar-tools");
  const searchToggle = button(
    "",
    "search",
    "pixel-button is-quiet is-icon pixel-search-toggle",
  );
  const searchIcon = el("span", "pixel-bar-icon is-search");
  searchIcon.setAttribute("aria-hidden", "true");
  const searchToggleLabel = el("span", "pixel-sr-only");
  searchToggle.append(searchIcon, searchToggleLabel);
  searchToggle.setAttribute("aria-expanded", "false");
  headTools.append(searchToggle);
  header.append(head);
  const main = el("main", "pixel-workspace");
  const notice = el("div", "pixel-notice");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.setAttribute("aria-atomic", "true");
  notice.hidden = true;
  const states = el("section", "pixel-states");
  const operations = el("section", "pixel-operation-region");
  const operationsTitle = el("h2", "pixel-group-title");
  const queue = el("section", "pixel-queue-region");
  const queueTitle = el("h2", "pixel-group-title");
  const queueView = button("", "host", "pixel-button", "offline-queue");
  const queueRetry = button(
    "",
    "host",
    "pixel-button",
    "offline-queue-status-retry",
  );
  const accountsPage = el("section", "pixel-account-page");
  accountsPage.tabIndex = -1;
  const accountTitle = el("h2", "pixel-sr-only");
  const count = el("span", "pixel-section-description");
  const toolbar = el("div", "pixel-toolbar");
  const searchForm = el("form", "pixel-search");
  searchForm.setAttribute("role", "search");
  searchForm.autocomplete = "off";
  const search = el("input");
  search.type = "search";
  search.name = "account-search";
  search.autocomplete = "off";
  search.setAttribute("autocapitalize", "none");
  search.setAttribute("autocorrect", "off");
  search.spellcheck = false;
  search.setAttribute("data-lpignore", "true");
  search.setAttribute("data-1p-ignore", "true");
  search.setAttribute("data-bwignore", "true");
  search.dataset.setting = "query";
  const clear = button("×", "clear", "pixel-button is-icon is-quiet");
  searchForm.append(search, clear);
  searchForm.hidden = true;
  searchForm.id = "pixel-search-" + ++disclosureSequence;
  searchToggle.setAttribute("aria-controls", searchForm.id);
  head.append(headerActions, brand, searchForm, headTools);
  const modes = labelSelect("mode");
  const sorting = labelSelect("sort");
  const groupSort = labelSelect("groupSort");
  const controls = el("div", "pixel-toolbar-controls");
  const services = labelSelect("service");
  services.label.classList.add("pixel-service-filter");
  services.title.classList.add("pixel-sr-only");
  const disclosure = el("div", "pixel-display-disclosure");
  const displayToggle = button(
    "",
    "display",
    "pixel-button is-quiet is-icon pixel-display-toggle",
  );
  const displayIcon = el("span", "pixel-bar-icon is-sort");
  displayIcon.setAttribute("aria-hidden", "true");
  const displayLabel = el("span", "pixel-sr-only");
  displayToggle.append(displayIcon, displayLabel);
  const displayPanel = el("div", "pixel-display-panel");
  displayPanel.id = "pixel-view-options-" + ++disclosureSequence;
  displayPanel.hidden = true;
  displayToggle.setAttribute("aria-expanded", "false");
  displayToggle.setAttribute("aria-controls", displayPanel.id);
  displayPanel.append(modes.label, sorting.label, groupSort.label);
  disclosure.append(displayToggle, displayPanel);
  // View options sit in the app bar beside search, like a filter button.
  headTools.prepend(disclosure);
  controls.append(services.label);
  const tabs = el("div", "pixel-tabs");
  tabs.setAttribute("role", "group");
  const tabNodes = new Map();
  let pressedTab = "";
  toolbar.append(controls, count);
  const empty = el("div", "pixel-empty-state");
  const emptyTitle = el("h3");
  const emptyDescription = el("p");
  const emptyAction = button("", "refresh");
  empty.append(emptyTitle, emptyDescription, emptyAction);
  const accountList = el("div", "pixel-groups");
  // RPG inventory: a bag of item slots. Each slot carries its own code, next code and timer.
  const bag = el("div", "pixel-bag");
  const bagWindow = el("div", "pixel-bag-window");
  const bagTitle = el("p", "pixel-window-title pixel-display");
  bagTitle.setAttribute("aria-hidden", "true");
  // The window header carries the title, search, service filter and view options.
  const bagHeader = el("div", "pixel-bag-header");
  bagHeader.append(bagTitle, toolbar);
  bagWindow.append(bagHeader, tabs, empty, accountList);
  bag.append(bagWindow);
  accountsPage.append(accountTitle, bag);
  const morePage = el("section", "pixel-subpage");
  morePage.tabIndex = -1;
  const moreBack = button("", "route", "pixel-button", "accounts");
  const moreTitle = el("h2", "pixel-section-title");
  moreTitle.tabIndex = -1;
  const managementHeading = el("div", "pixel-management-heading");
  managementHeading.append(moreBack, moreTitle);
  const featureList = el("div", "pixel-management-groups");
  const managementGroups = new Map(
    ["data", "tools", "settings", "application"].map((key) => {
      const section = el("section", "pixel-management-group");
      const title = el("h3");
      const toggle = button("", "management-group", "pixel-group-toggle", key);
      const panel = el("div", "pixel-management-list");
      panel.id = "pixel-management-" + ++disclosureSequence;
      toggle.setAttribute("aria-controls", panel.id);
      toggle.setAttribute(
        "aria-expanded",
        String(key === activeManagementGroup),
      );
      panel.hidden = key !== activeManagementGroup;
      title.append(toggle);
      section.append(title, panel);
      featureList.append(section);
      return [key, { section, toggle, panel }];
    }),
  );
  morePage.append(managementHeading, featureList);
  const footer = el("footer", "pixel-footer");
  const credit = el("span", "", "Pixel · MIT");
  const license = el("a", "", "Licenses · MIT / Fonts · OFL");
  license.href = new URL("../licenses/NOTICE.txt", import.meta.url).href;
  // The 2FA version, a newer release and the project links, from the host.
  const about = el("div", "pixel-footer-about");
  const aboutVersion = el("span", "pixel-footer-version");
  const aboutUpdate = el("a", "pixel-footer-update");
  const aboutLinks = [
    ["documentation", "pageDocumentation", "Documentation"],
    ["extension", "pageBrowserExtension", "Browser extension"],
    ["feedback", "pageFeedback", "Report an issue"],
    ["source", "aboutSourceCode", "Source code"],
  ].map(([key, labelKey, fallback]) => ({
    key,
    labelKey,
    fallback,
    node:
      key === "extension"
        ? button("", "host", "pixel-footer-link", "extension")
        : el("a", "pixel-footer-link"),
  }));
  for (const link of [aboutUpdate, ...aboutLinks.map((item) => item.node)])
    if (link.tagName === "A") {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  // On phones the links form their own two-column block under the version.
  const aboutLinkList = el("div", "pixel-footer-links");
  aboutLinkList.append(...aboutLinks.map((item) => item.node));
  about.append(aboutVersion, aboutUpdate, aboutLinkList);
  about.hidden = true;
  footer.append(credit, license, about);
  // The notice opens inside the page: a new window in an installed app closes
  // the app when the user goes back.
  const licensePanel = el("section", "pixel-license-panel");
  licensePanel.id = "pixel-license-" + ++disclosureSequence;
  licensePanel.hidden = true;
  const licenseHead = el("div", "pixel-license-head");
  const licenseTitle = el("h2", "pixel-license-title", license.textContent);
  const licenseClose = el(
    "button",
    "pixel-button is-quiet pixel-license-close",
  );
  licenseClose.type = "button";
  licenseHead.append(licenseTitle, licenseClose);
  const licenseText = el("pre", "pixel-license-text");
  licenseText.tabIndex = -1;
  licensePanel.append(licenseHead, licenseText);
  license.setAttribute("aria-expanded", "false");
  license.setAttribute("aria-controls", licensePanel.id);
  main.append(
    notice,
    states,
    operations,
    queue,
    accountsPage,
    morePage,
    footer,
    licensePanel,
  );
  surface.append(skip, header, main);
  root.append(surface);

  let licenseLoaded = false;
  let licenseLoading = false;
  function setLicenseOpen(open) {
    licensePanel.hidden = !open;
    license.setAttribute("aria-expanded", String(open));
    if (!open) {
      license.focus({ preventScroll: true });
      return;
    }
    licenseClose.textContent = t("close", "Close");
    if (!licenseLoaded && !licenseLoading) {
      licenseLoading = true;
      licenseText.textContent = local("waiting");
      Promise.resolve()
        .then(() => window.fetch(license.href))
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.text();
        })
        .then(
          (text) => {
            licenseLoading = false;
            if (!live) return;
            licenseLoaded = true;
            licenseText.textContent = text;
            // The text makes the panel taller; centre it again so it stays clear of bottom bars.
            if (!licensePanel.hidden)
              licensePanel.scrollIntoView?.({ block: "center" });
          },
          () => {
            licenseLoading = false;
            if (live) licenseText.textContent = local("failed");
          },
        );
    }
    licenseText.focus({ preventScroll: true });
    // Centred, so fixed bottom bars and floating buttons cannot cover it.
    licensePanel.scrollIntoView?.({ block: "center" });
  }
  license.addEventListener("click", (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (live) setLicenseOpen(licensePanel.hidden);
  });
  licenseClose.addEventListener("click", () => setLicenseOpen(false));
  licensePanel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    setLicenseOpen(false);
  });

  function currentAccount(id) {
    return snapshot.library.accounts.find((account) => account.ref.id === id);
  }
  function clearNotice() {
    noticeGeneration += 1;
    noticeSequence += 1;
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
    notice.textContent = "";
    notice.hidden = true;
  }
  function say(message, { kind = "info" } = {}) {
    if (!live) return;
    if (!message) {
      clearNotice();
      return;
    }
    window.clearTimeout(noticeTimer);
    const sequence = ++noticeSequence;
    notice.textContent = message;
    notice.dataset.kind = kind;
    notice.hidden = false;
    noticeTimer = window.setTimeout(
      () => {
        if (!live || sequence !== noticeSequence) return;
        noticeTimer = null;
        notice.textContent = "";
        notice.hidden = true;
      },
      kind === "error" ? 8000 : 4000,
    );
  }
  function explain(reason) {
    if (reason === "authentication-required")
      return t("loginSubmitBtn", "Sign in");
    if (reason === "unavailable" || reason === "host-unavailable")
      return local("unavailable");
    const keys = {
      "write-busy-reclick": "coreHotpWriteBusy",
      offline: "coreHotpCopyOffline",
      "clipboard-failed": "copyFailed",
      "reservation-rejected": "coreHotpRejected",
      "operation-pending-account-changed": "coreHotpAccountChangedPending",
      "counter-limit": "coreHotpLimit",
      "reconciliation-failed": "coreHotpReconcileFailed",
    };
    if (keys[reason]) return t(keys[reason], local("failed"));
    return [
      "not-ready",
      "stale-target",
      "expired",
      "clock-changed",
      "account-changed",
    ].includes(reason)
      ? local("expired")
      : local("failed");
  }
  function observe(
    promise,
    kind = "command",
    operationId = null,
    copied = local("copied"),
  ) {
    const session = snapshot.epochs.session;
    const generation = noticeGeneration;
    const notify = (message, type) => {
      if (generation === noticeGeneration) say(message, { kind: type });
    };
    Promise.resolve(promise).then(
      (result) => {
        if (
          !live ||
          snapshot.epochs.session !== session ||
          ["mount-invalidated", "session-invalidated"].includes(result?.reason)
        )
          return;
        if (kind === "reconcile" && result?.status === "committed") {
          const operation = snapshot.host.operations?.find(
            (item) => item.operationId === operationId,
          );
          if (operation) {
            const facts = operationFacts(operation);
            notify(
              [facts.clipboard, facts.reservation, facts.attention]
                .filter(Boolean)
                .join(" · "),
              operationResolved(operation) ? "success" : "error",
            );
          }
        } else if (result?.clipboard) {
          if (result.reservation && result.reservation !== "not-attempted") {
            renderOperations();
            const facts = operationFacts(result);
            notify(
              [facts.clipboard, facts.reservation, facts.attention]
                .filter(Boolean)
                .join(" · "),
              operationResolved(result) ? "success" : "error",
            );
          } else {
            notify(
              result.clipboard === "copied" ? copied : explain(result.reason),
              result.clipboard === "copied" ? "success" : "error",
            );
          }
        } else if (
          ["rejected", "unknown", "not-started"].includes(result?.status)
        )
          notify(explain(result.reason), "error");
        else if (
          // The page itself shows a scheme change; a notice would only repeat it.
          !["host", "scheme"].includes(kind) &&
          ["committed", "loaded"].includes(result?.status)
        )
          notify(local("done"), "success");
      },
      () => {
        if (live && snapshot.epochs.session === session)
          notify(local("failed"), "error");
      },
    );
  }
  function operationResolved(operation) {
    // A confirmed reservation and a completed clipboard do not prove that the
    // local counter committed. Only a complete commit or a successful readback
    // can resolve that conflict, and a read cannot confirm an unknown POST.
    if (
      operation.status !== "settled" ||
      operation.clipboard !== "copied" ||
      operation.reservation !== "confirmed"
    )
      return false;
    if (
      operation.reason === "local-refresh-failed" &&
      operation.reconciliation !== "succeeded"
    )
      return false;
    return (
      (operation.localCommit === "committed" &&
        operation.recovery === "none" &&
        ["not-needed", "succeeded"].includes(operation.reconciliation)) ||
      (operation.reconciliation === "succeeded" &&
        operation.recovery === "reconciled")
    );
  }
  function operationFacts(operation) {
    const states = {
      pending: "coreHotpStatePending",
      confirmed: "coreHotpStateConfirmed",
      rejected: "coreHotpStateRejected",
      unknown: "coreHotpStateUnknown",
      copied: "coreHotpStateCopied",
      failed: "coreHotpStateFailed",
    };
    const clipboard = t(
      states[operation.clipboard] || "coreHotpStateUnknown",
      local("unknown"),
    );
    const reservation = t(
      states[operation.reservation] || "coreHotpStateUnknown",
      local("unknown"),
    );
    let attention = "";
    if (operation.reconciliation === "running") attention = local("waiting");
    else if (
      operation.reconciliation === "failed" ||
      operation.recovery === "retry-reconcile"
    )
      attention = t("coreHotpReconcileFailed", local("failed"));
    else if (
      operation.clipboard === "failed" &&
      operation.reservation === "confirmed"
    )
      attention = t("coreHotpCopyFailedAdvanced", local("failed"));
    else if (!operationResolved(operation))
      attention = t("coreHotpReconcile", local("waiting"));
    return {
      clipboard: t("coreHotpClipboardState", `Clipboard: ${clipboard}`, {
        state: clipboard,
      }),
      reservation: t(
        "coreHotpReservationState",
        `Reservation: ${reservation}`,
        { state: reservation },
      ),
      attention,
    };
  }
  function host(request, trigger) {
    closeMenu(false);
    const returnFocus =
      states.contains(trigger) || queue.contains(trigger)
        ? more
        : trigger
            .closest?.(".pixel-management-group")
            ?.querySelector(".pixel-group-toggle") || trigger;
    const handle = sdk.host.open(request, { returnFocus });
    if (handle.status === "rejected")
      say(explain(handle.reason), { kind: "error" });
    else observe(handle.closed, "host");
  }
  function descriptorRequest(value) {
    const found = sdk.host
      .listActions()
      .find((item) => item.actionId === value);
    return found?.request || { kind: value };
  }
  function closeMenu(restoreFocus = true) {
    const card = cards.get(menuId);
    if (card) {
      card.menu.hidden = true;
      card.node.dataset.menuOpen = "false";
      card.trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus && card.trigger.isConnected) card.trigger.focus();
    }
    menuId = null;
  }
  function openMenu(id, focus = false) {
    if (menuId === id) {
      closeMenu();
      return;
    }
    closeMenu(false);
    const card = cards.get(id);
    if (!card) return;
    menuId = id;
    card.menu.hidden = false;
    card.node.dataset.menuOpen = "true";
    card.trigger.setAttribute("aria-expanded", "true");
    if (focus) card.menu.firstElementChild?.focus();
  }
  function cancelAnimation(id) {
    animations.get(id)?.cancel();
    animations.delete(id);
  }
  function copy(id, slot) {
    const target = sdk.otp.readCopyTarget(id, slot);
    if (target.status !== "ready") {
      say(explain(target.reason), { kind: "error" });
      return;
    }
    const card = cards.get(id);
    cancelAnimation(id);
    if (card)
      (slot === "next" ? card.nextValue : card.value).textContent =
        target.target.value;
    // Name the slot: the current and the next code are copied the same way.
    const account = currentAccount(id);
    const copied = t(
      slot === "next" ? "coreCopiedNextService" : "coreCopiedService",
      local("copied"),
      { name: account?.service.label || t("coreCode", "Code") },
    );
    // Same event stack: no await before the SDK starts the native clipboard.
    observe(sdk.otp.copy(target.target), "copy", null, copied);
  }
  function createCard(account) {
    const node = el("article", "pixel-card");
    node.dataset.account = account.ref.id;
    const cardHeader = el("div", "pixel-card-header");
    const icon = el("span", "pixel-service-mark");
    icon.setAttribute("aria-hidden", "true");
    const names = el("div", "pixel-account-identity");
    const service = el("h3", "pixel-account-name");
    const accountLabel = el("p", "pixel-account-address");
    names.append(service, accountLabel);
    const menuHolder = el("div", "pixel-account-menu");
    const trigger = button("⋮", "menu", "pixel-button is-icon");
    trigger.setAttribute("aria-expanded", "false");
    const menu = el("div", "pixel-menu-popover");
    menu.hidden = true;
    const menuActions = ["qr", "uri", "link", "edit", "delete"].map((action) =>
      button(
        "",
        action,
        "pixel-menu-item" + (action === "delete" ? " is-danger" : ""),
      ),
    );
    menu.append(...menuActions);
    menuHolder.append(trigger, menu);
    cardHeader.append(icon, names, menuHolder);
    const codes = el("div", "pixel-codes");
    const codeLabel = el("div", "pixel-otp-label pixel-sr-only");
    codeLabel.id = "pixel-code-details-" + ++disclosureSequence;
    const currentLabel = el("span");
    const badge = el("span", "pixel-badge");
    codeLabel.append(currentLabel, badge);
    const hotpLabel = el("span", "pixel-hotp-label", "HOTP");
    names.append(hotpLabel);
    const copyButton = button("", "copy", "pixel-copy-code");
    copyButton.setAttribute("aria-describedby", codeLabel.id);
    const value = el("span", "pixel-otp-value");
    const copyIcon = el("span", "pixel-copy-symbol", "⧉");
    copyIcon.setAttribute("aria-hidden", "true");
    copyButton.append(value, copyIcon);
    const codeStatus = el("span", "pixel-code-status");
    codeStatus.hidden = true;
    const next = button("", "next", "pixel-otp-next");
    const nextValue = el("span", "pixel-next-value");
    next.append(nextValue);
    codes.append(codeLabel, copyButton, codeStatus, next);
    const timing = el("div", "pixel-expiry");
    const timingLabel = el("div", "pixel-expiry-label");
    const timingTitle = el("span");
    const remaining = el("strong");
    timingLabel.append(timingTitle, remaining);
    const progress = el("div", "pixel-progress");
    progress.setAttribute("aria-hidden", "true");
    const fill = el("span", "pixel-progress-fill");
    progress.append(fill);
    timing.append(timingLabel, progress);
    node.append(cardHeader, codes, timing);
    return {
      node,
      icon,
      service,
      accountLabel,
      trigger,
      menu,
      menuActions,
      currentLabel,
      hotpLabel,
      badge,
      copyButton,
      codeStatus,
      value,
      next,
      nextValue,
      timing,
      timingTitle,
      remaining,
      progress,
      fill,
      account,
      previous: null,
    };
  }
  // Shows the service icon once it has loaded. The letter stays when there is
  // no icon or it cannot load (the editor preview does not allow it).
  function setServiceMark(
    node,
    account,
    letter = Array.from(account.service.label)[0] || "•",
  ) {
    const url = account.service.iconURL || "";
    if (node.dataset.letter === letter && node.dataset.icon === url) return;
    node.dataset.letter = letter;
    node.dataset.icon = url;
    node.classList.remove("has-icon");
    node.textContent = letter;
    if (!url) return;
    const image = node.ownerDocument.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.addEventListener(
      "load",
      () => {
        if (node.dataset.icon !== url) return;
        node.replaceChildren(pixelIcon(image) || image);
        node.classList.add("has-icon");
      },
      { once: true },
    );
    image.src = url;
  }
  // Redraws a loaded icon as a 16×16 sprite: hard-edged transparency and a
  // reduced palette, scaled up by CSS without smoothing. Returns null where a
  // canvas is unavailable, and the icon is then shown as it is.
  function pixelIcon(image) {
    const size = 16;
    const canvas = image.ownerDocument.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext?.("2d");
    if (!context) return null;
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, size, size);
    } catch {
      return null;
    }
    try {
      const pixels = context.getImageData(0, 0, size, size);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const solid = data[i + 3] >= 110;
        for (let channel = 0; channel < 3; channel++)
          data[i + channel] = Math.round(data[i + channel] / 32) * 32;
        data[i + 3] = solid ? 255 : 0;
      }
      context.putImageData(pixels, 0, 0);
    } catch {
      // An icon from another origin cannot be read back; the coarse grid alone still reads as pixels.
    }
    canvas.className = "pixel-service-sprite";
    return canvas;
  }
  function updateCard(card, account) {
    card.account = account;
    card.service.textContent = account.service.label;
    card.service.title = account.service.label;
    card.accountLabel.textContent = account.accountLabel;
    card.accountLabel.title = account.accountLabel;
    card.accountLabel.hidden = !account.accountLabel;
    setServiceMark(
      card.icon,
      account,
      (Array.from(account.service.label)[0] || "•").toUpperCase(),
    );
    // Deterministic item rarity colour from the stable account id.
    card.icon.dataset.tone = String(
      Array.from(account.ref.id).reduce(
        (sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0,
        7,
      ) % 6,
    );
    card.trigger.setAttribute(
      "aria-label",
      t("cardMenuAriaLabel", local("more")) + " · " + account.service.label,
    );
    const labels = [
      ["cardMenuQRCode", "QR"],
      ["cardMenuCopyURI", "Copy URI"],
      ["cardMenuCopyLink", "Copy link"],
      ["cardMenuEdit", "Edit"],
      ["cardMenuDelete", "Delete"],
    ];
    card.menuActions.forEach((node, index) => {
      node.textContent = t(...labels[index]);
    });
    card.currentLabel.textContent = local("current");
    card.hotpLabel.hidden = account.type !== "HOTP";
    card.node.dataset.type = account.type;
    // Only counter-based accounts carry a badge; TOTP needs no metadata.
    card.badge.textContent = account.type === "HOTP" ? account.type : "";
    card.badge.hidden = account.type !== "HOTP";
    const value = account.otp.current?.value || "···";
    if (card.previous !== null && card.previous !== value) {
      cancelAnimation(account.ref.id);
      const effect = snapshot.preferences.otpAnimation;
      if (
        !snapshot.preferences.reducedMotion &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
        card.value.animate &&
        effect !== "none"
      ) {
        const frames =
          effect === "flip"
            ? [{ transform: "rotateX(75deg)" }, { transform: "rotateX(0)" }]
            : effect === "spotlight"
              ? [
                  { background: "var(--pixel-green-fill)" },
                  { background: "transparent" },
                ]
              : [
                  { transform: "translateY(-5px)", opacity: 0.4 },
                  { transform: "translateY(0)", opacity: 1 },
                ];
        animations.set(
          account.ref.id,
          card.value.animate(frames, { duration: 180 }),
        );
      }
    }
    card.previous = value;
    card.value.textContent = value;
    card.value.dataset.digits = String(account.digits);
    card.copyButton.disabled =
      account.otp.current?.copyAvailability !== "ready";
    card.codeStatus.hidden = !card.copyButton.disabled;
    card.codeStatus.textContent =
      account.otp.current?.copyAvailability === "offline"
        ? local("offline")
        : account.otp.state === "error"
          ? local("failed")
          : local("waiting");
    card.copyButton.title = card.copyButton.disabled
      ? account.otp.current?.copyAvailability === "offline"
        ? local("offline")
        : local("waiting")
      : t("copyOtpBtnTitle", "Copy code");
    card.copyButton.setAttribute(
      "aria-label",
      `${t("copyOtpBtnAriaLabel", "Copy current code")} · ${account.service.label} ${account.accountLabel}`,
    );
    card.next.hidden = account.type === "HOTP";
    card.next.disabled = account.otp.next?.copyAvailability !== "ready";
    card.nextValue.textContent = account.otp.next?.value || "···";
    card.next.setAttribute(
      "aria-label",
      `${t("copyNextOtpBtnTitle", "Copy next code")} · ${account.service.label}`,
    );
    card.next.title = t("copyNextOtpBtnTitle", "Copy next code");
    card.progress.hidden = account.type === "HOTP";
    card.timingTitle.textContent =
      account.type === "HOTP"
        ? t("counterLabel", "Counter")
        : `${account.period}${local("seconds")}`;
  }
  function renderTime() {
    if (!live) return;
    const now = sdk.clock?.now();
    for (const card of cards.values()) {
      const account = card.account;
      if (account.type === "HOTP") {
        card.remaining.textContent = String(account.counter);
        continue;
      }
      const current = account.otp.current;
      const seconds =
        typeof now === "number" && current
          ? Math.max(0, Math.ceil((current.validUntil - now) / 1000))
          : null;
      card.remaining.textContent =
        seconds === null ? local("waiting") : `${seconds}${local("seconds")}`;
      card.timing.dataset.expiring = String(seconds !== null && seconds <= 5);
      card.fill.style.setProperty(
        "--pixel-progress",
        `${seconds === null ? 0 : Math.min(100, (seconds / account.period) * 100)}%`,
      );
      if (seconds === 0) {
        card.copyButton.disabled = true;
        card.codeStatus.hidden = false;
        if (account.otp.current?.copyAvailability === "ready")
          card.codeStatus.textContent = local("waiting");
      }
    }
  }
  function syncChildren(parent, nodes) {
    nodes.forEach((node, index) => {
      if (parent.children[index] !== node)
        parent.insertBefore(node, parent.children[index] || null);
    });
    while (parent.children.length > nodes.length)
      parent.lastElementChild.remove();
  }
  function renderAccounts() {
    const view = snapshot.library.view;
    const ids = new Set(
      snapshot.library.accounts.map((account) => account.ref.id),
    );
    for (const [id, card] of cards)
      if (!ids.has(id)) {
        if (menuId === id) closeMenu(false);
        cancelAnimation(id);
        card.node.remove();
        cards.delete(id);
      }
    for (const account of snapshot.library.accounts) {
      let card = cards.get(account.ref.id);
      if (!card) {
        card = createCard(account);
        cards.set(account.ref.id, card);
      }
      if (
        card.account.ref.generation !== account.ref.generation &&
        menuId === account.ref.id
      )
        closeMenu(false);
      updateCard(card, account);
    }
    const sections =
      view.mode === "grouped" && view.groups.length
        ? view.groups
        : [{ groupId: "pixel-flat", label: "", ids: view.resultIds }];
    const structure = JSON.stringify([
      view.mode,
      sections.map((group) => [group.groupId, group.label, group.ids]),
    ]);
    if (structure !== lastStructure) {
      const liveGroups = new Set();
      const sectionsDOM = sections.map((group) => {
        liveGroups.add(group.groupId);
        let section = groups.get(group.groupId);
        if (!section) {
          section = {
            node: el("section", "pixel-group"),
            title: el("h3", "pixel-group-title"),
            list: el("div", "pixel-account-grid"),
          };
          section.node.append(section.title, section.list);
          groups.set(group.groupId, section);
        }
        section.title.textContent =
          view.mode === "grouped" && group.label
            ? `${group.label} · ${group.ids.length}`
            : group.label;
        section.title.hidden =
          !group.label || (sections.length === 1 && group.isOther);
        syncChildren(
          section.list,
          group.ids.map((id) => cards.get(id)?.node).filter(Boolean),
        );
        return section.node;
      });
      syncChildren(accountList, sectionsDOM);
      for (const id of groups.keys())
        if (!liveGroups.has(id)) groups.delete(id);
      lastStructure = structure;
    }
    if (menuId && !cards.get(menuId)?.node.isConnected) closeMenu(false);
    renderTabs();
    bagTitle.textContent = `${local("accounts")} · ${view.found}`;
    count.textContent = t("searchFoundCount", `${view.found} / ${view.total}`, {
      found: view.found,
      total: view.total,
    });
    const filtered = Boolean(view.query || view.serviceFilter);
    count.classList.toggle("pixel-sr-only", !filtered);
    const signedOut = snapshot.session.state === "logged-out";
    empty.hidden = view.found > 0 && !signedOut;
    accountList.hidden = signedOut;
    const loading = snapshot.library.state === "loading";
    const failure = snapshot.library.state === "error";
    emptyTitle.textContent = signedOut
      ? t("loginSubmitBtn", "Sign in")
      : loading
        ? t("loadingSecrets", local("waiting"))
        : failure
          ? local("failed")
          : filtered
            ? t("searchNoMatch", "No matching accounts")
            : t("emptyTitle", "No accounts yet");
    emptyDescription.textContent =
      signedOut || loading
        ? ""
        : filtered
          ? t("searchNoMatchDesc", "Try a different search")
          : t("emptyDesc", "Add an account to generate verification codes.");
    emptyAction.textContent = signedOut
      ? t("loginSubmitBtn", "Sign in")
      : failure || loading
        ? t("retry", "Retry")
        : filtered
          ? t("searchClearAriaLabel", "Clear search")
          : t("emptyAddBtn", "Add account");
    emptyAction.dataset.action = signedOut
      ? "host"
      : failure || loading
        ? "refresh"
        : filtered
          ? "clear"
          : "host";
    emptyAction.dataset.value = signedOut ? "login" : "account-add";
    renderTime();
  }
  // The strip has no scrollbar (it would sit between the tabs and the window's
  // edge), so a mouse wheel over it scrolls it sideways until it reaches an end.
  function tabWheel(event) {
    if (event.deltaX || tabs.scrollWidth <= tabs.clientWidth) return;
    const before = tabs.scrollLeft;
    // Firefox reports some wheels in lines (deltaMode 1) rather than pixels.
    tabs.scrollLeft += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (tabs.scrollLeft !== before) event.preventDefault();
  }
  function renderTabs() {
    const view = snapshot.library.view;
    const active = view.serviceFilter || "";
    // Every service has a tab: the service list stays hidden, so a service
    // without one could only be found by searching. The strip scrolls.
    const entries = [
      ["", local("all"), view.total],
      ...view.services.map((item) => [item.groupId, item.label, item.count]),
    ];
    tabs.setAttribute("aria-label", local("service"));
    tabs.hidden = view.services.length < 2;
    const keys = new Set(entries.map(([id]) => id));
    for (const [key, node] of tabNodes)
      if (!keys.has(key)) {
        if (node === document.activeElement)
          services.select.focus({ preventScroll: true });
        tabNodes.delete(key);
      }
    syncChildren(
      tabs,
      entries.map(([id, label, total]) => {
        let node = tabNodes.get(id);
        if (!node) {
          node = button("", "tab", "pixel-tab", id);
          node.append(
            el("span", "pixel-tab-label"),
            el("span", "pixel-tab-count"),
          );
          tabNodes.set(id, node);
        }
        node.firstChild.textContent = label;
        node.lastChild.textContent = String(total);
        node.title = label;
        node.setAttribute("aria-pressed", String(id === active));
        return node;
      }),
    );
    // Bring a newly chosen tab into the strip; the page itself does not move.
    if (active !== pressedTab) {
      pressedTab = active;
      const node = tabNodes.get(active);
      const strip = tabs.getBoundingClientRect();
      const box = node?.getBoundingClientRect();
      if (box && (box.left < strip.left || box.right > strip.right))
        tabs.scrollLeft +=
          box.left - strip.left - (strip.width - box.width) / 2;
    }
  }
  function preserveStatusFocus(node) {
    if (!snapshot.host.dialogOpen && node.contains(document.activeElement))
      more.focus({ preventScroll: true });
  }
  function renderStates() {
    const entries = [];
    const addState = (key, text, action, value) =>
      entries.push({ key, text, action, value });
    if (sdk.identity.mode === "preview")
      addState("preview", "Preview · Synthetic data / 预览 · 合成数据");
    if (snapshot.session.state !== "authenticated")
      addState("session", t("loginSubmitBtn", "Sign in"), "host", "login");
    if (!snapshot.connectivity.onlineHint)
      addState("offline", local("offline"));
    // Cached accounts show first on every load; name them only once the refresh is over,
    // and not beside a failed refresh, which already says so and offers a retry.
    if (
      snapshot.library.source === "local" &&
      !["refreshing", "error"].includes(snapshot.library.refreshState)
    )
      addState("local", local("local"));
    if (snapshot.library.refreshState === "error")
      addState("refresh-error", local("failed"), "refresh");
    if (
      // Only a clock that was never checked; a cached offset from an earlier check is fine.
      snapshot.clock.status === "local"
    )
      addState("clock", t("clockWarningText", local("clock")));
    if (snapshot.library.hidden.count)
      addState(
        "hidden",
        `${t("pageHiddenAccounts", "Hidden accounts")} · ${snapshot.library.hidden.count}`,
        "host",
        "hidden-accounts",
      );
    if (snapshot.host.updateAvailable || snapshot.host.versionMismatch)
      addState("update", t("pwaUpdateBtn", "Update"), "reload", "update");
    if (snapshot.host.offlineReady === false)
      addState("offline-ready", local("offlineNotReady"));
    const keys = new Set(entries.map((item) => item.key));
    for (const [key, node] of stateNodes)
      if (!keys.has(key)) preserveStatusFocus(node);
    syncChildren(
      states,
      entries.map(({ key, text, action, value }) => {
        let node = stateNodes.get(key);
        if (!node) {
          node = action
            ? button("", action, "pixel-state pixel-button", value)
            : el("p", "pixel-state");
          node.dataset.state = key;
          stateNodes.set(key, node);
        }
        if (node.textContent !== text) node.textContent = text;
        return node;
      }),
    );
    for (const key of stateNodes.keys())
      if (!keys.has(key)) stateNodes.delete(key);
    states.hidden = entries.length === 0;
  }
  function setManagementGroup(key, focus = false) {
    activeManagementGroup = key;
    for (const [id, group] of managementGroups) {
      const open = key === id;
      if (
        !open &&
        !snapshot.host.dialogOpen &&
        group.panel.contains(document.activeElement)
      )
        (managementGroups.get(key)?.toggle || group.toggle).focus({
          preventScroll: true,
        });
      group.panel.hidden = !open;
      group.toggle.setAttribute("aria-expanded", String(open));
    }
    if (focus && !snapshot.host.dialogOpen)
      managementGroups.get(key)?.toggle.focus({ preventScroll: true });
  }
  function renderManagement() {
    const actions = sdk.host.listActions().filter((item) => {
      if (item.requires) return false;
      switch (item.actionId) {
        // Safe mode is offered by the host's error bar, not the menu.
        case "recovery":
        case "hidden-accounts":
        case "offline-queue":
        case "offline-queue-status-retry":
          return false;
        case "login":
          return snapshot.session.state === "logged-out";
        case "logout":
          return ["authenticated", "unconfirmed"].includes(
            snapshot.session.state,
          );
        case "pwa-install":
          return snapshot.host.installAvailable === true && item.enabled;
        default:
          return true;
      }
    });
    const signature = JSON.stringify([lang, actions]);
    for (const [key, group] of managementGroups)
      group.toggle.textContent = local(
        "group" + key[0].toUpperCase() + key.slice(1),
      );
    if (signature === lastChrome) return;
    const available = new Set(
      actions.filter((item) => item.enabled).map((item) => item.actionId),
    );
    const tools = new Set(toolIds);
    const providers = new Set(providerIds);
    const grouped = new Map(
      [...managementGroups.keys()].map((key) => [key, []]),
    );
    grouped.get("settings").push(scheme);
    const retained = new Set();
    for (const item of actions) {
      if (available.has("tools") && tools.has(item.actionId)) continue;
      if (available.has("settings:sync") && providers.has(item.actionId))
        continue;
      retained.add(item.actionId);
      const key = groupOf(item.actionId);
      let row = featureNodes.get(item.actionId);
      if (!row) {
        const node = button("", "host", "pixel-feature", item.actionId);
        const label = el("span");
        const reason = el("small", "pixel-muted");
        node.append(label, reason);
        row = { node, label, reason };
        featureNodes.set(item.actionId, row);
      }
      const label =
        item.actionId === "appearance"
          ? local("appearance")
          : item.actionId === "quick-otp"
            ? t("quickOtpTitle", "Generate verification code")
            : t(item.labelKey, local("unavailable"));
      if (row.label.textContent !== label) row.label.textContent = label;
      row.node.disabled = !item.enabled;
      const reason = item.enabled ? "" : explain(item.reason);
      if (row.reason.textContent !== reason) row.reason.textContent = reason;
      row.reason.hidden = item.enabled;
      grouped.get(key).push(row.node);
    }
    for (const [key, row] of featureNodes)
      if (!retained.has(key)) {
        if (
          !snapshot.host.dialogOpen &&
          row.node.contains(document.activeElement)
        )
          (
            row.node
              .closest(".pixel-management-group")
              ?.querySelector(".pixel-group-toggle") || more
          ).focus({ preventScroll: true });
        featureNodes.delete(key);
      }
    const id = (node) => node.dataset.value || node.dataset.action;
    for (const [key, nodes] of grouped)
      syncChildren(
        managementGroups.get(key).panel,
        nodes.sort((a, b) => menuRank(key, id(a)) - menuRank(key, id(b))),
      );
    lastChrome = signature;
  }
  function renderOperations() {
    const records = (snapshot.host.operations || []).filter(
      (item) => item.type === "hotp" && !operationResolved(item),
    );
    operations.hidden = records.length === 0;
    operationsTitle.textContent = t(
      "coreHotpOperationTitle",
      "HOTP operation status",
    );
    const ids = new Set(records.map((operation) => operation.operationId));
    syncChildren(operations, [
      operationsTitle,
      ...records.map((operation) => {
        let row = operationRows.get(operation.operationId);
        if (!row) {
          row = {
            node: el("div", "pixel-operation"),
            name: el("strong"),
            clipboard: el("span"),
            reservation: el("span"),
            attention: el("span"),
            reconcile: button(
              "",
              "reconcile",
              "pixel-button",
              operation.operationId,
            ),
            recover: button("", "reload", "pixel-button", "recovery"),
          };
          row.node.append(
            row.name,
            row.clipboard,
            row.reservation,
            row.attention,
            row.reconcile,
            row.recover,
          );
          operationRows.set(operation.operationId, row);
        }
        const account = currentAccount(String(operation.accountId));
        row.name.textContent = account?.service.label || "HOTP";
        const facts = operationFacts(operation);
        row.clipboard.textContent = facts.clipboard;
        row.reservation.textContent = facts.reservation;
        row.attention.textContent = facts.attention;
        row.attention.hidden = !facts.attention;
        row.reconcile.textContent = t(
          "coreHotpReconcile",
          "Check counter state",
        );
        row.reconcile.disabled = operation.reconciliation === "running";
        row.recover.textContent = t(
          "coreHotpRecoveryReload",
          "Recover in safe mode",
        );
        row.recover.hidden = operation.recovery !== "reload-required";
        return row.node;
      }),
    ]);
    for (const id of operationRows.keys())
      if (!ids.has(id)) operationRows.delete(id);
  }
  function renderQueue() {
    const records = snapshot.queue.operations || [];
    const hidden =
      records.length === 0 &&
      !snapshot.queue.unavailable &&
      !snapshot.queue.authRequired;
    if (hidden) preserveStatusFocus(queue);
    queue.hidden = hidden;
    queueTitle.textContent = local("queue");
    queueView.textContent = t("offlineQueueView", "View pending changes");
    queueRetry.textContent = t("restoreRefresh", "Refresh");
    if (!snapshot.queue.unavailable) preserveStatusFocus(queueRetry);
    queueRetry.hidden = !snapshot.queue.unavailable;
    const nodes = [queueTitle, queueView, queueRetry];
    const ids = new Set();
    records.forEach((item) => {
      const id = item.operationId || item.id;
      ids.add(id);
      let row = queueRows.get(id);
      if (!row) {
        row = {
          node: el("div", "pixel-operation"),
          name: el("strong"),
          status: el("span"),
          actions: new Map(),
        };
        row.node.append(row.name, row.status);
        queueRows.set(id, row);
      }
      row.name.textContent = item.name || local("accounts");
      const status =
        item.status === "failed" || item.failureReason
          ? local("failed")
          : item.claimed || item.status === "sending"
            ? local("waiting")
            : local("queue");
      row.status.textContent = status;
      for (const [flag, kind, key, fallback] of [
        ["canEdit", "offline-queue-edit", "offlineQueueEditRetry", "Edit"],
        ["canRetry", "offline-queue-retry", "retry", "Retry"],
        [
          "canCancel",
          "offline-queue-cancel",
          "offlineQueueCancelChange",
          "Cancel",
        ],
      ]) {
        let action = row.actions.get(kind);
        if (!action) {
          action = button("", "queue", "pixel-button", kind);
          row.actions.set(kind, action);
          row.node.append(action);
        }
        action.textContent = t(key, fallback);
        if (!item[flag]) preserveStatusFocus(action);
        action.hidden = !item[flag];
        action.dataset.operation = id;
        action.disabled = Boolean(item.claimed || snapshot.queue.busy);
      }
      nodes.push(row.node);
    });
    for (const [id, row] of queueRows)
      if (!ids.has(id)) preserveStatusFocus(row.node);
    syncChildren(queue, nodes);
    for (const id of queueRows.keys()) if (!ids.has(id)) queueRows.delete(id);
  }
  function renderChrome() {
    skip.textContent = local("skip");
    accountTitle.textContent = local("accounts");
    scheme.textContent = t(
      snapshot.preferences.resolvedTheme === "dark"
        ? "themeLight"
        : "themeDark",
      snapshot.preferences.resolvedTheme === "dark" ? "Light" : "Dark",
    );
    moreLabel.textContent = local("manage");
    searchToggleLabel.textContent = searchForm.hidden
      ? t("searchInputAriaLabel", "Search accounts")
      : t("searchClearAriaLabel", "Clear search");
    if (
      snapshot.library.view.query &&
      searchForm.hidden &&
      !accountsPage.hidden
    )
      setSearching(true, false);
    search.placeholder = t(
      "searchInputPlaceholder",
      "Search service or account",
    );
    search.setAttribute(
      "aria-label",
      t("searchInputAriaLabel", "Search accounts"),
    );
    clear.setAttribute("aria-label", t("searchClearAriaLabel", "Clear search"));
    if (document.activeElement !== search)
      search.value = snapshot.library.view.query;
    modes.title.textContent = t("viewModeLabel", "View");
    options(
      modes.select,
      [
        ["grouped", t("viewModeGrouped", "Grouped")],
        ["flat", t("viewModeFlat", "Flat")],
      ],
      snapshot.library.view.mode,
    );
    sorting.title.textContent = t(
      snapshot.library.view.mode === "flat"
        ? "sortModeFlatLabel"
        : "sortModeLabel",
      "Sort",
    );
    const sorts = [
      ["oldest-first", "sortOldestFirst", "Oldest first"],
      ["newest-first", "sortNewestFirst", "Newest first"],
      ["name-asc", "sortServiceNameAsc", "Service A–Z"],
      ["name-desc", "sortServiceNameDesc", "Service Z–A"],
      ["account-asc", "sortAccountNameAsc", "Account A–Z"],
      ["account-desc", "sortAccountNameDesc", "Account Z–A"],
    ];
    options(
      sorting.select,
      sorts
        .filter(
          ([key]) =>
            snapshot.library.view.mode === "flat" || !key.startsWith("name-"),
        )
        .map(([value, key, fallback]) => [value, t(key, fallback)]),
      snapshot.library.view.mode === "flat"
        ? snapshot.library.view.flatSort
        : snapshot.library.view.groupedItemSort,
    );
    groupSort.label.hidden = snapshot.library.view.mode !== "grouped";
    groupSort.title.textContent = t("groupSortLabel", "Group sort");
    options(
      groupSort.select,
      [
        ["name-asc", t("groupSortNameAsc", "Name A–Z")],
        ["name-desc", t("groupSortNameDesc", "Name Z–A")],
      ],
      snapshot.library.view.groupSort,
    );
    displayLabel.textContent = local("view");
    services.title.textContent = local("service");
    options(
      services.select,
      [
        ["", `${local("all")} (${snapshot.library.view.total})`],
        ...snapshot.library.view.services.map((service) => [
          service.groupId,
          `${service.label} (${service.count})`,
        ]),
      ],
      snapshot.library.view.serviceFilter || "",
    );
    services.select.title =
      services.select.selectedOptions[0]?.textContent || "";
    moreBack.textContent = local("back");
    moreTitle.textContent = local("manage");
    renderManagement();
  }
  function applyAppearance(next) {
    currentAppearance = next || {};
    const settings = currentAppearance.settings || {};
    surface.dataset.landscape =
      settings.landscape === "none"
        ? "hidden"
        : settings.landscape === "outpost"
          ? "outpost"
          : "valley";
    surface.dataset.density =
      settings.density === "compact" ? "compact" : "comfortable";
    surface.dataset.accent = ["green", "violet", "rose"].includes(
      settings.accent,
    )
      ? settings.accent
      : "green";
    surface.dataset.pixelText = String(settings.pixelChinese !== false);
  }
  function syncHostAppearance() {
    if (typeof sdk.host.setAppearance !== "function") return;
    const settings = currentAppearance.settings || {};
    const signature = JSON.stringify([
      snapshot.preferences.resolvedTheme === "dark",
      surface.dataset.accent,
      settings.pixelChinese !== false,
    ]);
    if (signature === lastHostAppearance) return;
    lastHostAppearance = signature;
    sdk.host.setAppearance(
      hostAppearance(settings, snapshot.preferences.resolvedTheme === "dark"),
    );
  }
  function closeDisplay(returnFocus = false) {
    if (displayPanel.hidden) return;
    displayPanel.hidden = true;
    displayToggle.setAttribute("aria-expanded", "false");
    if (returnFocus) displayToggle.focus();
  }
  function toggleDisplay() {
    if (!displayPanel.hidden) closeDisplay(true);
    else {
      closeMenu(false);
      displayPanel.hidden = false;
      displayToggle.setAttribute("aria-expanded", "true");
    }
  }
  function route(focus = false) {
    // The app bar's search and view controls belong to the accounts page.
    const previousPage =
      [accountsPage, morePage].find((page) =>
        page.contains(document.activeElement),
      ) ||
      (headTools.contains(document.activeElement) ||
      searchForm.contains(document.activeElement)
        ? accountsPage
        : undefined);
    if (focus || noticeRoute !== window.location.hash) {
      clearNotice();
      noticeRoute = window.location.hash;
    }
    const current =
      /^#\/theme\/pixel\/(accounts|more|preferences)$/.exec(
        window.location.hash,
      )?.[1] || "accounts";
    if (current !== "accounts") closeDisplay(false);
    accountsPage.hidden = current !== "accounts";
    morePage.hidden = current === "accounts";
    more.setAttribute("aria-expanded", String(!morePage.hidden));
    headTools.hidden = current !== "accounts";
    // Other pages fold the search away but keep the query for the way back.
    if (current !== "accounts") {
      if (!searchForm.hidden) setSearching(false, false, false);
    } else if (snapshot.library.view.query && searchForm.hidden)
      setSearching(true, false);
    if (current === "preferences") setManagementGroup("settings");
    if (!snapshot.host.dialogOpen && (focus || previousPage?.hidden)) {
      const target =
        current === "accounts"
          ? focus || searchForm.hidden
            ? accountsPage
            : search
          : moreTitle;
      target.focus({ preventScroll: true });
    }
  }
  function render(next) {
    if (!live) return;
    if (snapshot.epochs.session !== next.epochs.session) {
      closeMenu(false);
      closeDisplay(false);
      say("");
      cards.forEach((_, id) => cancelAnimation(id));
    }
    snapshot = next;
    lang = next.preferences.resolvedLanguage || "en";
    surface.lang = lang;
    surface.dataset.colorScheme =
      next.preferences.resolvedTheme === "dark" ? "dark" : "light";
    surface.dataset.reducedMotion = String(
      next.preferences.reducedMotion === true,
    );
    if (next.host.dialogOpen) {
      closeMenu(false);
      closeDisplay(false);
    }
    syncHostAppearance();
    renderChrome();
    renderAccounts();
    renderStates();
    renderOperations();
    renderQueue();
    renderAbout();
  }
  // Hosts before host.about have no version to show; the row stays hidden.
  function renderAbout() {
    const info = snapshot.host.about;
    about.hidden = !info;
    if (!info) return;
    aboutVersion.textContent = `2FA v${info.version}`;
    aboutUpdate.hidden = !(info.latestVersion && info.links?.releases);
    if (!aboutUpdate.hidden) {
      aboutUpdate.href = info.links.releases;
      aboutUpdate.textContent = t(
        "versionUpdateAvailable",
        `New version available: v${info.latestVersion}`,
        { version: `v${info.latestVersion}` },
      );
    }
    const extension = sdk.host
      .listActions()
      .find((item) => item.actionId === "extension");
    for (const { key, labelKey, fallback, node } of aboutLinks) {
      node.textContent = t(labelKey, fallback);
      if (key === "extension") node.hidden = !extension?.enabled;
      else {
        node.hidden = !info.links?.[key];
        if (!node.hidden) node.href = info.links[key];
      }
    }
  }
  // The whole card copies its current code; its buttons and menu keep their own actions.
  function copyFromCard(event) {
    const node = event.target.closest?.("[data-account]");
    const card = node && cards.get(node.dataset.account);
    if (!live || !card || card.node !== node || !surface.contains(node)) return;
    if (card.menu?.contains(event.target)) return;
    if (event.target.closest("a, button, input, select, textarea, label"))
      return;
    if (String(window.getSelection?.() || "")) return;
    if (!card.copyButton.disabled) card.copyButton.click();
  }
  function onClick(event) {
    const trigger = event.target.closest?.("[data-action]");
    if (!trigger) {
      copyFromCard(event);
      return;
    }
    if (!surface.contains(trigger) || trigger.disabled || !live) return;
    const action = trigger.dataset.action,
      value = trigger.dataset.value;
    const id = trigger.closest("[data-account]")?.dataset.account;
    if (action !== "menu" && !trigger.closest(".pixel-menu-popover"))
      closeMenu(false);
    if (!disclosure.contains(trigger)) closeDisplay(false);
    if (action === "management-group")
      setManagementGroup(activeManagementGroup === value ? null : value);
    else if (action === "display") toggleDisplay();
    else if (action === "tab") sdk.view.setServiceFilter(value || null);
    else if (action === "host") host(descriptorRequest(value), trigger);
    else if (action === "queue")
      host({ kind: value, operationId: trigger.dataset.operation }, trigger);
    else if (["qr", "edit", "delete"].includes(action)) {
      const account = currentAccount(id);
      if (account)
        host(
          { kind: "account-" + action, account: account.ref },
          cards.get(id)?.trigger || trigger,
        );
    } else if (action === "uri" || action === "link") {
      const account = currentAccount(id);
      closeMenu();
      if (account)
        observe(
          action === "uri"
            ? sdk.accounts.copyURI(account.ref)
            : sdk.accounts.copyShareLink(account.ref),
          "copy",
        );
    } else if (action === "copy" || action === "next")
      copy(id, action === "next" ? "next" : "current");
    else if (action === "menu") openMenu(id);
    else if (action === "refresh") observe(sdk.accounts.refresh());
    else if (action === "search") setSearching(searchForm.hidden);
    else if (action === "clear") {
      clearNotice();
      search.value = "";
      sdk.view.setQuery("");
      sdk.view.setServiceFilter(null);
      search.focus();
    } else if (action === "scheme")
      observe(
        sdk.preferences.set({
          theme:
            snapshot.preferences.resolvedTheme === "dark" ? "light" : "dark",
        }),
        "scheme",
      );
    else if (action === "reconcile")
      observe(sdk.otp.reconcile(value), "reconcile", value);
    else if (action === "reload") observe(sdk.lifecycle.requestReload(value));
    else if (action === "route" || action === "skip") {
      // The menu button also closes the management page it opened.
      const page =
        action === "skip" || (trigger === more && !morePage.hidden)
          ? "accounts"
          : value;
      window.location.hash = "/theme/pixel/" + page;
      route(true);
    }
  }
  // Opening search shows the field in place of the title; closing it from the
  // bar clears the query.
  function setSearching(open, focus = true, clear = true) {
    searchForm.hidden = !open;
    brand.hidden = open;
    header.dataset.searching = String(open);
    searchToggle.setAttribute("aria-expanded", String(open));
    searchToggleLabel.textContent = open
      ? t("searchClearAriaLabel", "Clear search")
      : t("searchInputAriaLabel", "Search accounts");
    if (open) {
      if (focus) search.focus();
      return;
    }
    if (clear && (search.value || snapshot.library.view.query)) {
      search.value = "";
      sdk.view.setQuery("");
    }
    if (focus) searchToggle.focus({ preventScroll: true });
  }
  function onSearchSubmit(event) {
    event.preventDefault();
  }
  function onInput(event) {
    if (event.target === search && !event.isComposing)
      sdk.view.setQuery(search.value);
  }
  function onCompositionEnd(event) {
    if (event.target === search) sdk.view.setQuery(search.value);
  }
  function onChange(event) {
    const key = event.target.dataset.setting,
      value = event.target.value;
    if (key === "service") sdk.view.setServiceFilter(value || null);
    else if (key === "mode") sdk.view.setMode(value);
    else if (key === "sort")
      sdk.view.setSort({
        [snapshot.library.view.mode === "flat"
          ? "flatSort"
          : "groupedItemSort"]: value,
      });
    else if (key === "groupSort") sdk.view.setSort({ groupSort: value });
  }
  function onKey(event) {
    if (
      snapshot.host.dialogOpen ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const trigger = event.target;
    if (
      trigger.dataset.action === "management-group" &&
      ["Enter", " "].includes(event.key)
    ) {
      event.preventDefault();
      if (!event.repeat)
        setManagementGroup(
          activeManagementGroup === trigger.dataset.value
            ? null
            : trigger.dataset.value,
        );
      return;
    }
    if (event.key === "Escape" && trigger.closest(".pixel-management-list")) {
      event.preventDefault();
      const key = activeManagementGroup;
      setManagementGroup(null);
      managementGroups.get(key)?.toggle.focus({ preventScroll: true });
      return;
    }
    if (trigger === displayToggle && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) toggleDisplay();
      return;
    }
    if (event.key === "Escape" && !displayPanel.hidden) {
      event.preventDefault();
      closeDisplay(true);
      return;
    }
    if (event.key === "Escape" && trigger === search && !searchForm.hidden) {
      event.preventDefault();
      setSearching(false);
      return;
    }
    if (event.key === "Escape" && menuId) {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (
      trigger.dataset.action === "menu" &&
      ["ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      openMenu(trigger.closest("[data-account]").dataset.account, true);
      return;
    }
    const menu = trigger.closest(".pixel-menu-popover");
    if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button:not(:disabled)")];
      const index = items.indexOf(trigger);
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[target]?.focus();
      return;
    }
    if (
      trigger.dataset.action !== "copy" ||
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    const items = [
      ...accountList.querySelectorAll('[data-action="copy"]'),
    ].filter((item) => !item.disabled);
    if (!items.length) return;
    event.preventDefault();
    if (event.key === "Home" || event.key === "End") {
      items[event.key === "Home" ? 0 : items.length - 1].focus();
      return;
    }
    const current = trigger.getBoundingClientRect();
    const x = current.left + current.width / 2,
      y = current.top + current.height / 2;
    const horizontal = ["ArrowLeft", "ArrowRight"].includes(event.key);
    const sign = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    const candidates = items
      .filter((item) => item !== trigger)
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - x,
          dy = rect.top + rect.height / 2 - y;
        return {
          item,
          forward: sign * (horizontal ? dx : dy),
          cross: Math.abs(horizontal ? dy : dx),
        };
      })
      .filter((item) => item.forward > 1)
      .sort((a, b) => a.cross * 4 + a.forward - (b.cross * 4 + b.forward));
    candidates[0]?.item.focus();
  }
  function outside(event) {
    if (!disclosure.contains(event.target))
      closeDisplay(displayPanel.contains(document.activeElement));
    if (menuId && !cards.get(menuId)?.node.contains(event.target))
      closeMenu(false);
  }
  function focusOutside(event) {
    if (!disclosure.contains(event.target)) closeDisplay(false);
  }
  function hashChange() {
    route(false);
  }
  surface.addEventListener("click", onClick);
  searchForm.addEventListener("submit", onSearchSubmit);
  surface.addEventListener("input", onInput);
  surface.addEventListener("compositionend", onCompositionEnd);
  surface.addEventListener("change", onChange);
  surface.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", focusOutside);
  window.addEventListener("hashchange", hashChange);
  tabs.addEventListener("wheel", tabWheel, { passive: false });
  applyAppearance(appearance);
  route();
  unsubscribe = sdk.subscribe(render);
  const timer = window.setInterval(renderTime, 250);
  function unmount() {
    if (!live) return;
    clearNotice();
    live = false;
    unsubscribe();
    window.clearInterval(timer);
    cards.forEach((_, id) => cancelAnimation(id));
    surface.removeEventListener("click", onClick);
    searchForm.removeEventListener("submit", onSearchSubmit);
    surface.removeEventListener("input", onInput);
    surface.removeEventListener("compositionend", onCompositionEnd);
    surface.removeEventListener("change", onChange);
    surface.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("focusin", focusOutside);
    window.removeEventListener("hashchange", hashChange);
    tabs.removeEventListener("wheel", tabWheel);
    signal?.removeEventListener("abort", unmount);
    surface.remove();
    cards.clear();
    groups.clear();
    tabNodes.clear();
    stateNodes.clear();
    featureNodes.clear();
  }
  signal?.addEventListener("abort", unmount, { once: true });
  return {
    update(nextAppearance) {
      if (!live) return;
      applyAppearance(nextAppearance);
      render(snapshot);
    },
    unmount,
  };
}
