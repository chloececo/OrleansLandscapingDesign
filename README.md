# Orleans Landscaping Design — The Garden Plan

A single-file, static garden-planning app (`index.html`) hosted on GitHub Pages.

## Releasing / deploying

On **every** release, bump the version in **two** places to the same value so
users with the page already open get the "new version available" refresh banner:

1. `const APP_VERSION = '…'` near the bottom of `index.html`.
2. `version.json` — `{"version":"…"}`.

Use a date-based version like `2026-08-20.1` (bump the trailing number for a
second deploy the same day). The open page polls `version.json` on load, every
few minutes, and when the tab regains focus; when it no longer matches the
baked-in `APP_VERSION` it shows a Refresh prompt. User work auto-saves to
`localStorage` (`gardenPlan16`), so reloading loses nothing.
