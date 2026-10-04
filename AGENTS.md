# Stanford Torus — agent instructions

## Canonical project skills

Read `.agents/skills/stanford-torus/SKILL.md` before project work. Its design, architecture, development, deployment and safety rules are authoritative for this application.

- Historical lookup: `.agents/skills/space-settlements-design-study-reference/SKILL.md` and its tested study-search helper.
- Asset authoring/review: `.agents/skills/3d-assets/SKILL.md`.
- Keep reusable project procedures in these repo-owned skills, not duplicated Hermes profile skills or shared-server mirrors.

## Goal and design authority

Reproduce NASA SP-413's Stanford Torus as a beautiful, walkable digital museum, eventually with shared social experiences. The original study controls historical design choices; use the reviewed `/study/` edition for lookup and the private source scan to verify consequential details. Distinguish sourced facts, interpretations, current simplifications and future features.

Do not freeze changeable dimensions in agent instructions. Geometry/coordinate parameters live in the current source modules and reference notes. The ground sheet's presentation convention is not independently specified by the historical report.

## Development default

Grant currently wants development on `main`, followed by scoped commit/push and verified redeployment. Do not create worktrees/branches/PRs or QA ports/services by default. Preserve unrelated changes; never reset unknown work or force-push. Agents working concurrently must have disjoint file ownership or use scratch outputs with parent integration.

## Architecture and deployment

- Simulation: plain Three.js ES modules in `src/`, `index.html`, directly served by the custom Node `server.mjs`.
- Reference/development pages: Next.js App Router in `app/`; build when those routes/config/dependencies change, not for legacy simulation files alone.
- Models and previews: `assets/`; mutable saved scene: `world.json`; reviewed source reader: `study/`; checks: `tests/`.
- Public site: `https://stanfordtorus.com/`; legacy `https://granawkins.com/oneillsim/` remains active. Preserve the internal `/oneillsim/` path prefix.
- Production: `oneillsim.service`, bound to `127.0.0.1:3200`. Inspect the actual service and current package scripts before choosing runtime/build commands.
- Restart only this service after verified project changes, inspect logs/status, and verify loopback plus both public entry points and affected functionality.

## Data and operational safety

`PUT /oneillsim/world.json` is intentionally unauthenticated and overwrites the live world. Never use it for tests, health checks or synthetic fixtures. Back up and scope any explicitly requested layout/data changes; otherwise preserve `world.json` byte-for-byte. Browser-intercepted GET fixtures are safe alternatives.

Keep the PDF, search SQLite database, credentials and backups outside public assets/Git. New `assets/*` files are ignored: stage only reviewed intended files. Preserve optimized skyboxes/compression/caching and existing camera/zoom/editor workflows unless the task concerns them.

For infrastructure changes, read the shared-server `AGENTS.md`, `docs/architecture.md`, and `docs/operations.md`; reference configs are not live deployment inputs. Inspect live Nginx, validate with `sudo nginx -t`, and reload only if valid. Avoid `npm --version` in the supervised gateway due to a known lifecycle-scanner false positive.

## Verification

Run real relevant static/unit/browser checks, report their results, verify remote commit identity after pushes, and confirm the service and affected routes after deployments. Do not claim fidelity, performance, working assets or game physics from plausible code alone. Record limitations honestly.
