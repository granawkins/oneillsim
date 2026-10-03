# OneillSim

A plain Three.js habitat simulation with a Next.js App Router application for the study reader, asset library, and future wiki pages. Both run behind the same Node server and retain the `/oneillsim` URL prefix.

## Run locally

Use Node.js 22.13 or newer (the search database uses `node:sqlite`).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3200/oneillsim/. If another server already occupies 3200, use `PORT=3201 npm run dev`.

For production:

```sh
npm run build
npm start
```

`npm start` serves the production build, so rebuild after changing application code. Use the custom `server.mjs` entry point for both development and production; running `next dev` or `next start` directly omits the simulation, source data, model files, world saves, and snapshot service. The existing systemd service still runs `npm start`; run `npm ci && npm run build` before restarting it after deployment. This is a self-hosted Node application, not a standalone/serverless Next deployment.

## Routes and code

| URL under `/oneillsim` | Owner / entry point |
| --- | --- |
| `/` | Original `index.html` and `src/main.js`; plain Three.js, no React runtime |
| `/study/` | `app/study/page.jsx` and `reader.jsx`; React shell mounts `study/study.js` |
| `/assets/` | Compact roadmap index in `app/assets/page.jsx` |
| `/assets/[slug]/` | Type page with shared references and selectable designs; `viewer.jsx` mounts `assets/gallery.js` |
| `/api/study/search` | Existing SQLite/embedding service in `src/study-search*.js` |
| `/api/snapshot` | Existing Playwright renderer in `server.mjs`, supporting the simulation and the Next asset page |
| `/world.json` | Existing JSON read/save endpoint |

`app/layout.jsx` is the shared Next layout. Add future content routes with normal App Router conventions, for example `app/wiki/page.jsx` or `app/wiki/[slug]/page.jsx`. Use Next `Link` for content-page navigation; use a normal anchor to the simulation because it is a separate document. Next `Link` applies the configured base path automatically. Public image/model URLs keep their existing `/oneillsim/study/images/` and `/oneillsim/assets/` paths.

The two interactive controllers return cleanup functions. Their React wrappers dispose event listeners, requests, animation frames, resize observers, and viewer resources on unmount. Page styles are scoped to `.study-page` and `.asset-page` so Next client navigation cannot mix their themes. The original static reader/gallery HTML shells remain available to extraction tools and standalone browser tests; their public `index.html` URLs redirect to the Next pages.

`server.mjs` handles the original simulation/static resources and APIs, then forwards content routes and Next build assets to Next. It never serves the new `app/` source directory or build/configuration files as static files. `next.config.mjs` holds the base path and trailing-slash policy.

## Local data and credentials

The ignored `study/images/` and `assets/ultimate-*` model directories must be copied separately or rebuilt. The private study search database lives at `~/.local/share/oneillsim/study-search.sqlite3`; keep it outside the repository. See `docs/reference/study-html-build.md` for source PDF extraction and the reviewed transcription workflow.

Keyword search works with the database alone. Semantic queries also require `OPENROUTER_API_KEY` in the server environment (or a local Next `.env.local`, which is ignored). The production service already loads `/home/granawkins/.env`. Never place credentials or the database in public assets.

## Checks

```sh
npm run build
npm run test:study
python3 -m unittest discover -s tests -p 'study*_test.py'
```

With the app running on 3201:

```sh
ONEILLSIM_NEXT_TEST_URL=http://127.0.0.1:3201/oneillsim/study/ node --test tests/study-reader.browser.test.js
ONEILLSIM_TEST_URL=http://127.0.0.1:3201/oneillsim node --test tests/next-app.browser.test.js tests/asset-gallery.route.test.js tests/assets-navigation.test.js tests/snapshot-api.integration.test.js
```

The browser/snapshot checks use Chromium. Set `SNAPSHOT_CHROMIUM_PATH` to your local executable when starting the server and running tests. Search tests mock query embeddings rather than spend API credits.

## Asset library

`src/asset-library.js` is the library registry: groups contain types with stable slugs, an optional thumbnail, shared references/facts, and a `variants` array. Empty arrays mean planned entries, displayed as names without dead links or thumbnail placeholders. The current model lives at `/oneillsim/assets/houses/`.

To add a design, put its OBJ, MTL, atlas and `.asset.json` manifest in its ignored asset directory, then register its `id`, `name`, and `directory` under the appropriate type. The type page lists all designs and their individual triangle/vertex counts from those manifests; selecting a design replaces the single active viewer. Put source-document links on the type, and model-specific interpretation notes in its manifest. Add an optional type thumbnail when available. The snapshot allowlist derives from the same registry. Legacy asset capture URLs redirect to the matching type page.

This roadmap does not add placeholder models to `src/editor/catalog.js`; only real, placeable models belong in the simulation catalog. Planned names are a starting inventory, not verified requirements from the study.

## Residential blockout

`/residential/` documents district A and its source allocations, with a selectable ground/lower-deck plan. `src/residential-plan.js` contains the dimensions and planning assumptions. `scripts/populate-residential.mjs [base-world.json]` replaces only the first 60° sector and backs up the previous local world to `/tmp` before writing. Use a current saved world as the base; regeneration replaces manual changes within that sector.

Placeholder shapes are ordinary saved asset records with an optional seventh tuple field, `blockout`, holding dimensions, color, category and deck elevation. The placement system renders them procedurally and preserves them through editor saves; they do not require OBJ files. The wiki describes the generated baseline, not subsequent manual world edits. Tests: `node --test tests/residential-plan.test.js tests/residential.browser.test.js` with the local preview running.

## Agricultural terraces

`/agriculture/` documents the adjacent 60–120° farm. `src/agriculture-plan.js` defines its seven levels, six stair runs, source area targets and 94 plots. `node scripts/populate-agriculture.mjs` replaces only that farm sector, backs up the current world under `/tmp`, and records `world.terraces`. The other sectors are retained.

`terrace-surfaces.js` provides shared analytic support queries; `terraces.js` builds curved deck slabs, stair openings and visible stair treads. The agricultural sector is cut out of the original ground and terrain patches. Selecting a deck isolates its geometry and assets and limits editor picking to that level. Asset tuple field 8 (`surface`, index 7) stores `{deckId,height}`; field 7 remains optional blockout geometry. World export preserves both attachments and terrace topology. The blockout generator uses each deck's own circumference when converting areas to dimensions.

Human walking follows connected surfaces with a 0.4 m step limit; stairs use a continuous slope for movement and stepped visual geometry. Unsupported edges are blocked. This is not a general collision engine: crop blocks/buildings and overhead slabs are not collision obstacles, and the farm entry shelf is not yet connected to residential ground. Use **Walk this deck** to enter. The wiki describes the initial generated layout rather than subsequent manual edits.

Validation: `node --test tests/agriculture-plan.test.js tests/agriculture.browser.test.js`. Browser tests check actual ray picking, placement/export on a lower deck, and traversing the stair runs. Use `ONEILLSIM_TEST_URL` to choose the local server.
