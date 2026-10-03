# Simulation loading performance

The legacy simulation is served directly; these changes do not require a Next.js build.

- Skybox faces use 1024 x 1024, quality-85 WebP, with a 12-character SHA-256 fingerprint in each filename. All six faces total 87,822 bytes versus 8,906,515 bytes for the original 2048px PNGs. Originals remain available for future re-encoding. Face order/orientation is unchanged.
- Distinct saved-world model types preload through a four-worker queue, with duplicates removed. Models are then placed in saved order with their existing IDs and transforms. Editor-only models load on demand. The current live world is composed of blockouts, so the model queue matters for imported worlds/future layouts; removing the unused editor preload helps this world immediately.
- The habitat renders before world loading finishes. Input/editing and console saves are disabled until readiness. Rotation begins only once ready; capture mode remains fixed.
- The custom static server gzips HTML, CSS, JS, JSON, OBJ, MTL, and SVG responses above 1KB when accepted. Images are not gzipped. Negotiation respects q=0 and validators vary by encoding.
- Fingerprinted skyboxes cache for a year with `immutable`. Unversioned files use ETag revalidation (`max-age=0, must-revalidate`) so code/model edits remain immediately visible but unchanged responses can return 304. World JSON remains `no-store` and never returns 304.
- Compression is scoped to the app's custom static routes; no shared Nginx configuration changes are needed.

Tests: `node --test tests/loading-performance.test.js tests/loading-performance.browser.test.js`.
Browser tests use a read-only live world and a separate browser-intercepted GET fixture for delayed model loading. They never PUT to the world endpoint. The intentionally unauthenticated world-save endpoint is unchanged.
