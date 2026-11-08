# Changelog

## 1.1.1

Documentation and packaging pass for the archive submission — no behavior change.

- **README rewritten** to match what the code does. The previous text claimed the plugin was entirely read-only ("100% 只读 / 零写操作") while `lib/cleaner.js` can delete selected folders; the storage half's cleanup capability is now stated explicitly, together with the `isPathSafeToClean()` allow-list it passes through first, and a table of which features write to disk and which do not.
- **Install instructions fixed.** The local-link setup no longer hardcodes one machine's absolute path; `dsh plugin add github:Siom126/dsh-plugin-storage-inspector` is documented as the normal path, with the link-based flow kept as local development.
- **Added `LICENSE`** (MIT), matching the `license` field that was already declared in `package.json`, and added it to `files` so it ships with the package.
- **Added `author`** and refreshed `description`; the old one described only the read-only dependency half and omitted the cleanup capability.
- Feature, route and safety claims in the README were checked against `lib/api-handler.js`, `lib/cleaner.js`, `lib/governance-store.js`, `lib/project-discovery.js` and `lib/workspace-store.js` (`npm test`: 28 passing).

## 1.1.0

Cross-project dependency governance (the four-layer fact chain): project discovery with depth limit and blocklist, Node runtime fingerprinting (`.nvmrc` > `.node-version` > `engines.node`), npm lockfile v2/v3 version extraction, and the drift matrix (`identical` / `drift-minor` / `drift-major` / `bucket-conflict`) reported as `blocked` / `warn` / `candidate` / `info`, behind a single-flight lock with a 60s TTL cache. Adds `GET /api/storage-inspector/deps/overview`, `/deps/project` and `POST /deps/refresh`.

## 1.0.0

Workspace disk usage analysis: per-workspace and per-session sizes split between record files and the projection cache, physical file classification (code, dependencies, build output, VCS, docs, media, global attachments), largest-files ranking, and the settings-page section plus sidebar badge.
