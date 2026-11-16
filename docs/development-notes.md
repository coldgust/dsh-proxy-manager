# Development notes

Findings that shaped the implementation, kept out of the user-facing README.

## How the page reaches the Host

The page posts JSON to a plain web prefix route (`/dsh-proxy-manager/<endpoint>`) registered with `ctx.webServer.register`. The handler first calls `ctx.connection.requestRejection(request)` — the same Host/Origin fence and browser-session check every Remote call goes through — then dispatches.

Two things this deliberately avoids:

- **A new Remote namespace.** `ctx.remote.<ns>` is generated at build time by the Remote assembly; a profile-installed bundle cannot add one.
- **`ctx.connection.rpc.handle()`.** Its channel is registered as a Connection route, but the desktop carrier does not dispatch that route: `POST /dsh-proxy-manager/snapshot` answered `405` (the static fallback) instead of reaching the handler, while other plugins' plain prefix routes answered normally. Registering the route directly fixed it.

`webServer` must be declared in the plugin's `inject`; `connection.rpc.handle` additionally reads `webServer` from the context that registers the channel, so it has to run inside `ctx.inject(['webServer'], …)`.

## Module caching

Node caches ES modules by URL, so disabling and enabling a plugin row in the same process keeps running the code that was imported first — a rebuild appears to have no effect. `lib/loader.js` therefore imports `lib/host.js` with a changing query (`?v=<timestamp>`), which makes every activation evaluate the current file. The first install still needs one restart.

## The row name must be the package root

`dsh-client-modules` derives the browser half from the manifest of the *package* that owns the Loader row, and a subpath specifier (for example `dsh-proxy-manager/host`) yields no browser half — the Host half runs while the settings page never appears. `cordis.patch.yml` therefore names the package root.

## Opening configuration files

macOS resolves a file by its content type. `pip.conf` had been claimed as `com.retroarch.conf` by an application that is no longer installed, so `open` failed with `kLSApplicationNotFoundErr` while plain dot-files opened fine. `open -t` (default text editor) ignores the association and works. The opener tries `open -t`, then `open`, then `open -R`, and only treats a non-zero exit as success for hand-off commands (`explorer`, `xdg-open`).

## Settings are not plugin config

The bundle declares no `Config`: a directory-linked install cannot resolve `@deepseek-ai/schemastery`, which the schema-based `Config` export needs. Settings and user-added adapters live in `$DSH_HOME/proxy-manager/state.json` instead, edited from the page, and the plugin never rewrites the profile's `cordis.patch.yml`.

## Build environment

pnpm blocks `esbuild`'s install script by default; its platform package still installs, so the binary loads and builds work. `packageManager` cannot be pinned here because pnpm needs to write `~/Library/pnpm`, which a restricted sandbox denies.

## Verification status

- macOS: end-to-end — detection, write/read/clear on real `~/.gitconfig` and `~/.npmrc` (restored byte-identical afterwards), page registered in the live Slot tree, plugin row `application: applied`.
- Windows / Linux: paths (`USERPROFILE`, `%APPDATA%`, `PATHEXT`), CRLF handling, `reg query` and `gsettings` parsing, `explorer` / `xdg-open` have unit tests driven by real sample output but have not been run on those platforms.
- The browser page has not been inspected in a real browser from this environment; registration and the request contract are covered by tests.
