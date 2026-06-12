# Releasing FugaEdge

How to build and ship a new version of the FugaEdge desktop app, plus
how auto-update distribution works via GitHub Releases.

## Quick reference

| Goal | Command |
| --- | --- |
| Day-to-day dev | `npm run dev` |
| Type + Vite build (no installer) | `npm run build` |
| Unpacked dir (smoke-test the app without installing) | `npm run pack` |
| Build the Windows installer locally | `npm run package:win` |
| Build for the current host platform | `npm run package` |
| Build AND publish to GitHub Releases | `npm run release` |

The installer output lands in `release/` (gitignored). Example:
`release/FugaEdge-Setup-0.1.0.exe`.

## 1. Bump the version

`package.json → version` must increase between every release. The
auto-updater compares the running app's version to `latest.yml` in the
GitHub Release and only fires when the release is strictly newer (semver).

```jsonc
// package.json
"version": "0.1.0" → "0.1.1"
```

Use [semver](https://semver.org/) — patch for fixes, minor for features,
major for breaking workflow changes.

## 2. Build the installer locally

```bash
npm run package:win
```

This runs `tsc --noEmit && electron-vite build && electron-builder --win`,
producing:

- `release/FugaEdge-Setup-<version>.exe` — the NSIS installer
- `release/win-unpacked/` — the unpacked app (useful for sanity-checking)
- `release/latest.yml` — auto-update manifest (must be uploaded with the
  installer so `electron-updater` can find it)

### Smoke-test the unpacked build first

```bash
npm run pack
# launches the unbuilt-installer app from release/win-unpacked/FugaEdge.exe
```

Or just double-click `release/win-unpacked/FugaEdge.exe`. No install needed.

### Run the installer

Double-click `release/FugaEdge-Setup-<version>.exe`. The NSIS config in
`package.json → build.nsis` is set to:

- `oneClick: false` — full installer dialog (not the silent variant)
- `perMachine: false` — install per-user, no admin elevation
- `allowToChangeInstallationDirectory: true` — let the user pick the
  install path
- `createDesktopShortcut: true`
- `createStartMenuShortcut: true`
- `shortcutName: "FugaEdge"`

After install, the app shows up in the Start menu, as a desktop
shortcut, and can be pinned to the taskbar like any normal Windows app.

## 3. Publish a GitHub Release for auto-update

### Before you publish — gating checklist

- [ ] **Cohort activation keys issued and DM'd via Circle BEFORE publishing
      the release** (v0.2.5 §C / D2). The activation gate ships enforced in
      packaged builds; publishing triggers auto-update, so a release that
      goes out before keys are in the cohort's hands locks them out at next
      launch. Issue with `node scripts/activation-keygen.mjs issue --name
      "<name>" --email "<email>"`.

- [ ] **Manual click-through of the three lock-screen export buttons (trades
      CSV / journal JSON / DB backup) on a locked-state build** — the one
      path automation cannot drive (native save dialogs).

The `publish` block in `package.json → build` points at:

```jsonc
"publish": {
  "provider": "github",
  "owner": "jahjafuga",
  "repo": "FugaEdge"
}
```

For auto-update to fire on user machines, every release must:

1. Be tagged in GitHub with `v<version>` (e.g. `v0.1.1`).
2. Have the installer (`FugaEdge-Setup-<version>.exe`) attached as a
   release asset.
3. Have `latest.yml` attached as a release asset. (electron-builder
   generates this for you; the `release` script uploads it.)

### Option A — let electron-builder publish for you

```bash
# Set a GitHub token with `repo` scope:
$env:GH_TOKEN = "ghp_..."   # PowerShell
# or: export GH_TOKEN=ghp_...   # bash

npm run release
```

`electron-builder --publish always` creates the draft release on GitHub,
uploads the installer + `latest.yml`, and tags it. Promote the draft to
"Published" in the GitHub UI when ready.

### Option B — manual upload

1. `npm run package:win`
2. Create a GitHub Release at `https://github.com/jahjafuga/FugaEdge/releases/new`
3. Tag: `v<version>`
4. Upload `release/FugaEdge-Setup-<version>.exe` AND `release/latest.yml`
   AND `release/FugaEdge-Setup-<version>.exe.blockmap` (auto-generated;
   electron-updater uses it for delta downloads).

## 4. Auto-update behaviour on user machines

The main process wires `electron-updater` in `electron/updater/index.ts`:

- On app launch (packaged builds only), `checkForUpdatesAndNotify()`
  fires.
- `autoDownload = true` — a newer release downloads in the background.
- `autoInstallOnAppQuit = true` — the update applies on the next app
  quit without any user prompt.
- The renderer subscribes via the `UPDATER_STATUS` IPC channel and
  shows a "Restart now" banner (`src/components/layout/UpdateBanner.tsx`)
  when a download completes. The user can dismiss-per-version (stored in
  `localStorage` under `fugaedge-update-banner-dismissed-version`) if
  they want to defer.
- Dev builds (`app.isPackaged === false`) skip the updater entirely — no
  network calls, no errors. Run `npm run dev` as normal.

## 5. Icon

The Windows installer icon currently uses `build/icon.png` (a copy of
the 256×256 brand icon at `public/fugaedge-icon.png`). For maximum
fidelity in Windows Explorer, taskbar, and the installer UI, replace
this with a proper multi-resolution `.ico` file (16/32/48/64/128/256 px)
and update `package.json → build.win.icon` to point at `build/icon.ico`.

There are several free converters (icoconvert.com, png2ico) — feed the
2048×2048 source if you have it for the cleanest small-resolution
downsamples.

**TODO**: replace `build/icon.png` with `build/icon.ico` once the
high-res brand source is available.

## 6. Testing the installer on a clean machine

Ideal: a Windows VM with no FugaEdge artifacts under
`%APPDATA%\FugaEdge`. Steps:

1. Build the installer (`npm run package:win`).
2. Copy `release/FugaEdge-Setup-<version>.exe` to the VM.
3. Run the installer — confirm the install path picker works.
4. Launch FugaEdge from the Start menu shortcut. The first launch
   shows the onboarding flow.
5. Pin to taskbar via right-click → "Pin to taskbar".

To dry-run an upgrade on the same machine:

1. Install `v0.1.0`.
2. Bump to `v0.1.1`, run `npm run release` (uploads to GitHub).
3. Launch the installed `v0.1.0` app — the auto-updater downloads
   `v0.1.1` silently and the in-app banner appears when ready.
4. Click "Restart now" → app restarts on `v0.1.1`.

## 7. Architectural note (per `ARCHITECTURE.md`)

The auto-updater lives entirely in `electron/updater/`. The renderer
only sees IPC events:

- `UPDATER_STATUS` — main → renderer push with current update state
- `UPDATER_GET_STATUS` — renderer → main one-shot query
- `UPDATER_CHECK_NOW` — renderer → main: trigger a manual check
- `UPDATER_QUIT_AND_INSTALL` — renderer → main: apply the staged update
  immediately

No business logic or DB access lives in the updater. It just listens to
`electron-updater` events and forwards them as IPC pushes.
