# OneillSim

A plain Three.js habitat simulation with a Next.js App Router application for the study reader, asset library, and future wiki pages. Both run behind the same Node server and retain the `/oneillsim` URL prefix.

## Agent workflows

Canonical project skills live in `.agents/skills/`: `stanford-torus` (vision, architecture, main-branch deployment), `space-settlements-design-study-reference` (reviewed source and tested search/page/segment helper), and `3d-assets` (shared modeling, preview and parallel-agent contracts). Read `AGENTS.md` first. These replace the old profile-owned `oneillsim` instructions; maintain procedures in this repository.

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

`src/asset-library.js` is the library registry: groups contain types with stable slugs, thumbnails, shared references/facts, and a `variants` array. The library contains 200 real model variants across all 67 types, with no empty types. The earlier 47-model completion is documented in [completed asset library](docs/completed-asset-library.md), and its 38 interior / nine exterior placements remain preserved.

The [Gardens of the Stanford Torus](docs/settlement-design.md) full-settlement composition adds 1,091 instances and replaces the appearance of 78 original Farm A plots while preserving their IDs, positions, decks and provenance. The saved scene contains 1,573 instances: distinct Garden Commons and Civic Gardens neighborhoods, planted Residential A public rooms, and productive farm landscapes connected by real curved pedestrian routes. Instanced rendering preserves logical editor objects; explicit crop-floor and solid-zone colliders preserve farm circulation. **Explore the gardens** offers named starting points while the whole-ring promenade, A descent and farm stair chain remain walkable. Detailed layouts and capacity counts are authored interpretation, not a fully engineered 10,000-person population claim.

To add a design, put its OBJ, MTL, atlas and `.asset.json` manifest in its ignored asset directory, then register its `id`, `name`, and `directory` under the appropriate type. The type page lists all designs and their individual triangle/vertex counts from those manifests; selecting a design replaces the single active viewer. Put source-document links on the type, and model-specific interpretation notes in its manifest. Add an optional type thumbnail when available. The snapshot allowlist derives from the same registry. Legacy asset capture URLs redirect to the matching type page.

This roadmap does not add placeholder models to `src/editor/catalog.js`; only real, placeable models belong in the simulation catalog. Planned names are a starting inventory, not verified requirements from the study.

The complete six-type **Furniture & small props** kit is registered and placed with six existing homes in Garden Court. See [asset/layout/performance details](docs/street-furniture-kit.md). The shared opaque atlas is 512px; all six models are under 300 triangles. The bounded court is a presentation interpretation, not a sourced historical floorplan.

## Residential A assets and source blockout

All 297 Residential A blockouts have been replaced with 49 curated, cylinder-curved assets, preserving IDs, deck attachments and the other 138 records. Details, migration safety and measured checks: [complete district assets](docs/residential-district-assets.md). `src/residential-plan.js` and the page retain the original area-allocation ledger. Do not run old whole-layout population scripts on the live asset-populated world.

### Original allocation baseline

`/residential/` documents district A, its central garden basin, and sidewall housing shelves at −48, −32 and −12 m. `src/residential-plan.js` contains the dimensions and separate indoor, exterior/access, park and circulation budgets. The −61.5 m service shelf sits below the basin. These levels are design choices, not dimensions read from the study.

Placeholder shapes are ordinary saved asset records with an optional seventh tuple field, `blockout`, holding dimensions, color, category and deck elevation. The placement system renders them procedurally and preserves them through editor saves; they do not require OBJ files. The wiki describes the generated baseline, not subsequent manual world edits. Tests: `node --test tests/residential-plan.test.js tests/residential.browser.test.js` with the local preview running.

## Agricultural terraces

`/agriculture/` documents the adjacent approximately 77–120° farm. `src/agriculture-plan.js` defines its seven levels, six stair runs and source area targets. Its narrower sector uses wider shelves and reallocates soybeans between levels while preserving all source-area totals.

`terrace-surfaces.js` provides shared analytic support queries; `terraces.js` builds curved deck slabs, stair openings and visible stair treads. The agricultural sector is cut out of the original ground and terrain patches. Selecting a deck isolates its geometry and assets and limits editor picking to that level. Asset tuple field 8 (`surface`, index 7) stores `{deckId,height}`; field 7 remains optional blockout geometry. World export preserves both attachments and terrace topology. The blockout generator uses each deck's own circumference when converting areas to dimensions.

Human walking follows connected surfaces with a 0.4 m step limit; stairs use a continuous slope for movement and stepped visual geometry. Unsupported edges are blocked. This is not a general collision engine: crop blocks/buildings and overhead slabs are not collision obstacles, and the farm entry shelf is not yet connected to residential ground. Use **Walk this deck** to enter. The wiki describes the initial generated layout rather than subsequent manual edits.

Validation: `node --test tests/agriculture-plan.test.js tests/agriculture.browser.test.js`. Browser tests check actual ray picking, placement/export on a lower deck, and traversing the stair runs. Use `ONEILLSIM_TEST_URL` to choose the local server.

## Master sector plan

`/layout/` shows all six districts and centered spoke landings. `src/settlement-plan.js` is authoritative for angular bounds: each 120° pair is split 430:240, yielding approximately 77.015° residential / 42.985° agricultural. Source requirements and the chosen allocation rule are recorded separately in `world.masterPlan`, which survives editor saves. Each generated parcel stores its district ID, normalized longitudinal `u`, `z`, dimensions, category and deck attachment. Lower decks use their actual radius when converting angular spans to metres.

Run `node scripts/populate-layout.mjs` to regenerate both designed A districts, all six landing placeholders, and land-use ground colors. A `/tmp` world backup is made first. Non-generated assets are remapped by their fraction within their old district; generated parcels and manual ground painting are replaced. The former `populate-residential.mjs` and `populate-agriculture.mjs` entry points now invoke this coordinated generator too. Four B/C districts have land-use allocation and landing markers only; detailed layouts have not been cloned into them.

Residential circulation and exterior/access are currently area reservations, not a connected walking network. There are no residential stairs/lifts yet. Six 24 m landing platforms and 20 m axis markers are placeholders rather than engineered spokes. Tests: `node --test tests/settlement-plan.test.js tests/residential-plan.test.js tests/agriculture-plan.test.js` plus the two corresponding browser tests.
