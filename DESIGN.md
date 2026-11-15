# Pixel — design brief

Pixel is a personal authenticator theme with pixel-paper surfaces, crisp outlines and quiet landscape illustrations. Accounts and their verification codes are the primary content, with clear access to their actions and settings.

## Layout

The account page is an RPG inventory. A bag window holds the accounts as item slots, and each slot is complete on its own: service icon, service name and menu on the first line, the account below, the current code (click to copy), the next code (click to copy) and a durability bar with the seconds left. Service icons are redrawn as 16 × 16 sprites (hard-edged transparency, a reduced palette, scaled without smoothing); a service without an icon shows its letter. There is no separate detail panel. Category tabs along the top of the bag filter by service, one for every service; the strip scrolls sideways (a mouse wheel over it scrolls it too) and brings a chosen tab into view; in grouped mode the groups dissolve into one grid because the tabs already carry the categories. An app bar runs across the top: a ☰ menu button (Manage) on the left, the 2FA title in the middle, and a filter button (view and sort options, dropping down under the bar) and a search button on the right. Search opens in place of the title; its ✕ closes it and clears the query, while moving to Manage only folds it away. The bag window header keeps the title and the service filter. Adding an account by hand is rare, so it sits in Manage with import and backup (and stays on the empty bag). Phones show one slot per row (two between 481 and 600 pixels) so the account stays readable.

## Visual direction

- Light: warm pixel-paper `#edf0e2`, opaque panel `#fbfcf4`, ink `#20241d`.
- Dark: canvas `#131816`, panel `#1c2320`, text `#e3eadb`.
- Accents: green for active controls, blue for focus, amber for actual expiry feedback. Status must have text or shape as well as color.
- Three-pixel outlines, four-pixel hard shadows, square controls, segmented expiry progress, quiet fixed pixel landscape.
- Silkscreen for short Latin display text and codes; Fusion Pixel for optional Chinese pixel typography. Fonts ship locally with their OFL notices. Account text has a readable system-font fallback. Fusion Pixel draws on a 12-pixel grid and has one weight, so with pixel typography on, text is 12 pixels (24 for page titles) and never bold; brighter ink marks emphasis. No pixel font is ever synthetically bolded.
- Timer bars in the light palette use a darker fill per accent (at least 3:1 against the track); the dark palette keeps its pale fills.
- No fake statistics or permanently displayed sample accounts in an installed theme.

## Layout

Header: the menu (Manage), the title, the view options and search. The bag header keeps the title; the category tabs are the only visible service filter; phones may wrap its controls while retaining 44-pixel targets. Counts do not repeat in a separate heading, and refresh belongs to management with contextual retries kept beside errors. Services use stable SDK group IDs, so navigation height is independent of service count. Current code remains visually dominant; next code and account actions are secondary. Account menus and host dialogs remain above adjacent cards.

The display disclosure preserves its DOM and focus across OTP publications. Enter/Space toggle it; Escape returns focus to its trigger; an outside pointer or focus departure closes it. Group sorting is visible only in grouped mode; accounts always render as cards. All action targets retain at least 44 pixels. Management uses four simple accordion groups and one real host preference entry; the old preferences route remains a usable settings landing page. Tool and sync aggregates replace only their known covered actions, with atomic fallbacks when aggregates are unavailable.

Compact cards preserve directly copyable current/next codes and explicit HOTP state, with algorithm/digits/period retained in accessible descriptions instead of repeated visible badges. On every screen the service and the account share the first line, the next code sits beside the code and padding shrinks, without fixed card heights; a slot drops from about 196 to 128 pixels on a desktop (164 to 128 on a phone) and keeps 44-pixel copy targets. Desktop compact slots are also narrower (240 instead of 280 pixels).

At 320/390 px the workspace becomes one column and controls wrap without horizontal overflow. Larger widths use the host's supported view preferences. Long account names truncate visually while retaining accessible full labels. The decorative landscape ignores pointer events, stays behind opaque account panels, and simplifies on mobile.

Motion is limited to truthful code expiry and user interaction. Reduced-motion preferences suppress decorative effects. Theme configuration provides landscape visibility, Chinese pixel typography, density and accent choices. The optional host appearance port maps the current palette to official dialogs with square geometry, two-pixel outlines and a four-pixel hard shadow; it never changes their business forms, modal position or focus handling.

## Integration status

This repository contains the native ESM Pixel frontend for theme API 2 / SDK API 1, a synthetic development shell, a portable build and behavior tests. The static design specimen remains design history rather than the installed entry point.

The production adaptation uses only service name and account label, matching the real account model. Public host flows provide forms, tools, recovery and sensitive actions; there is no parallel OTP implementation or private account store in this theme.

## Asset provenance

Landscape illustrations and local fonts retain their original asset bytes, copyrights and complete license notices. Bundled asset acknowledgements are recorded in `NOTICE.md`; full license texts are shipped in `licenses/`.

Real camera/OAuth/cloud roundtrips, OS-level PWA installation and Safari remain untested.
