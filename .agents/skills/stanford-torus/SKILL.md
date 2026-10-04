---
name: stanford-torus
description: Use when developing or operating Stanford Torus.
version: 0.1.0
author: Grant (granawkins), Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [stanford-torus, oneillsim, threejs, nextjs, deployment]
    related_skills: [space-settlements-design-study-reference, 3d-assets]
---

# Stanford Torus

Build a beautiful, explorable 3D digital museum of the Stanford Torus described in NASA SP-413, *Space Settlements: A Design Study*. Visitors should experience life in a spinning garden in space; the long-term social vision is people meeting at the same cafe/location and chatting together. Aim for an experience people want to share, not merely an engineering diagram. Multiplayer/social interactions remain a future feature, not something to imply already works.

The main public product is the 3D simulation. `/study/`, `/assets/`, `/residential/`, `/agriculture/`, and `/layout/` primarily help Grant and agents coordinate development and research. The project is still named `oneillsim` on disk/infrastructure; do not rename services, repositories, or URLs as a side effect of the skill's new name.

## When to use

Use for project development, diagnosis, operation, planning, or delegation. Load `space-settlements-design-study-reference` for historical questions and `3d-assets` for asset creation/review. This file is the project-owned replacement for the old Hermes `oneillsim` skill; maintain these skills in `.agents/skills/`, not duplicated profiles or server mirrors.

## Design authority

- SP-413 is the controlling design document: the aim is faithful reproduction, not a loosely inspired space habitat. Look up historical requirements through the study-reference skill before inventing dimensions, allocations, systems, or architecture.
- Label sourced design, interpretation, prototype simplification, and future features separately. If the study is silent or contradictory, expose that gap; do not manufacture specifications to claim perfect fidelity.
- Keep changeable dimensions and design parameters in source code/ledgers, not this overview. Preserve the existing camera/zoom/editor experience unless the request concerns it.

## Architecture and locations

Paths below are relative to the repository root (production checkout: `/home/granawkins/oneillsim`).

- `index.html`, `src/main.js`, `src/scene.js`: plain Three.js simulation, outside React.
- `src/controls/`: human/planner/god camera modes, input, transitions, movement.
- `src/physics/`: fixed-step human capsule controller and spatially indexed colliders; tuning, lifecycle, limitations and checks: `docs/character-physics.md`.
- `src/cylinder.js`, `src/torus.js`, `src/lighting.js`, `src/stars.js`: habitat and environment.
- `src/terrace-*.js`, `src/terraces.js`, `src/*-plan.js`: walkable levels and authored layout plans.
- `src/editor/`: placement, model loading, catalog, terrain painting, saved-world conversion.
- `world.json`: mutable live scene data; never disposable test input.
- `assets/ultimate-buildings/`, `assets/ultimate-nature/`, `assets/icons/`, `assets/skybox/`: models, skins, thumbnails, sky.
- `src/asset-library.js`, `assets/gallery.js`: development asset registry and Three.js viewer.
- `app/`: Next.js App Router development/reference pages; `next.config.mjs`: base-path rules.
- `study/`: reviewed reading manifest, reader layout, corrections, tables, generated figure images.
- `server.mjs`, `src/study-search*.js`, `src/static-response.js`: HTTP routing, world saves, search, snapshots, compression/cache.
- `docs/`: explanatory research/operations notes; `tests/`: unit and browser regressions.
- `.agents/skills/`: canonical agent workflows and executable lookup helpers.
- Private host storage `~/.local/share/oneillsim/`: source PDF and study SQLite search database, outside the served checkout.

## Development and deployment default

Grant's current default is **work on `main`, commit/push, and redeploy when a requested change is finished**. The project is not announced yet; do not create branches/worktrees/PRs or QA services by default. This convention may change later. Existing isolated work in progress can be integrated to `main` after review without discarding it.

1. Use `read_file` for `AGENTS.md`, `README.md`, `package.json`, and relevant modules; check `git status --short --branch` and fetch remote changes with `terminal`. Preserve unrelated modifications. Fast-forward `main` when clean; never reset unknown work.
2. Make scoped changes, add relevant tests, and review `git diff --check`. Protect live `world.json`; hash it before/after unrelated work. Back up and scope any intentionally requested world/layout edit. Do not regenerate a layout casually.
3. Run real checks. Legacy `src/`, assets, and simulation HTML are directly served and do not require a Next build. Next-managed page/config/dependency changes require the appropriate `next build`/dependency workflow from current `package.json`; inspect the live service's pinned runtime instead of assuming system Node. Do not invoke `npm --version` in the gateway (known lifecycle-scanner false positive).
4. Commit only intended files on `main`, push without force, and verify remote commit identity. New asset files may be ignored: explicitly stage intended files, never blanket force-add asset directories.
5. Restart only `oneillsim.service`; inspect status/journal and read-only GETs at `http://127.0.0.1:3200/oneillsim/`, `https://stanfordtorus.com/`, and `https://granawkins.com/oneillsim/`. Check affected browser behavior, not just HTTP status. Report commit and checks.

Use `terminal(command="sudo systemctl cat oneillsim.service")` before changing runtime assumptions. The service must remain loopback-only on port 3200. Preserve the internal `/oneillsim/` prefix even though the main domain exposes root paths. For infrastructure edits, first read the shared server's `AGENTS.md`, architecture, and operations docs; inspect live Nginx config, run `sudo nginx -t`, and reload only after validation.

## Performance and coordination

- Preserve fingerprinted WebP skyboxes, gzip for large text responses, ETag revalidation, immutable versioned-asset caching, and fresh `world.json`. Details/tests: `docs/loading-performance.md`.
- Profile actual world contents, load time, collision cost, and draw calls before choosing optimizations. Do not promise game-like performance without measurements.
- Use small browser-test viewports for state assertions on this software-WebGL host. Distinguish external CDN/startup timeouts from gameplay failures; retain behavior assertions and use a bounded readiness wait. Verify deployed physics with unrouted browser visits, not only candidate response interception.
- Delegate independent tasks with explicit files, acceptance criteria, source references, and forbidden side effects. On shared `main`, use disjoint file ownership or scratch outputs plus parent integration; never let agents overwrite each other's catalogs/worlds or independently restart production.

## Pitfalls and verification

- Keep geometry/prototype descriptions out of agent instructions when they can drift. Verify current code and source references rather than treating old notes as design parameters.
- `world.json` has an intentionally unauthenticated public PUT save endpoint. Do not use it for tests, health checks, or fixtures; preserve its current behavior unless asked to change it, and disclose it in deployment reports.
- Shared-server config copies can lag live infrastructure. Repo-local skills are authoritative for this app; server docs cover infrastructure, not historical design.
- A completed task has a working artifact and real test/read-back output. State limitations and what was not verified; no invented screenshots, test results, or source citations.
