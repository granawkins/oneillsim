# Stable camera links and PNG snapshots

The simulation accepts camera parameters on `/` so a scene can be revisited without manual navigation. The PNG API accepts the same game-view parameters and renders the page in a headless browser.

## Game camera parameters

- `x` and `y`: paired plan-view coordinates in metres on the torus ground circle. The current modeled ground radius is 830 m; both values must be within 1 m of that circle. If omitted, use `theta` instead.
- `theta`: angular position around the ring, in degrees; default 90°.
- `z`: position along the tube axis, in metres; current allowed range is −60 to +60 m.
- `yaw`: camera heading relative to the local surface frame, in degrees; default −90°.
- `pitch`: local camera pitch, in degrees; positive values look upward; allowed range is −89° to +89°.
- `mode`: `human` or `planner`. Planner height is an absolute `height` in metres above the ground (10–200 m). An explicit height is more repeatable than replaying wheel/scroll events.
- `ringRotation`: habitat-group rotation in degrees; default 0°.
- `capture=1`: hides the HUD and freezes the habitat at `ringRotation` for a clean, repeatable view.

Example: stand 8 m in front of the first saved home, facing its local +Z facade and looking up 10°:

```text
/?x=778.9737&y=286.5310&z=8&yaw=0&pitch=10&mode=human
```

Add `capture=1` to that URL to hide the interface and freeze the habitat rotation. These example coordinates come from the first saved-home placement; the x/y pair is on the 830 m ground circle.

## Snapshot API

`GET /api/snapshot` returns `image/png` directly. It renders only the local game page or the curated asset viewer; it does not accept an arbitrary target URL.

Game capture:

```text
/api/snapshot?scene=game&x=778.9737&y=286.5310&z=8&yaw=0&pitch=10&mode=human&imageWidth=1280&imageHeight=800
```

Asset capture:

```text
/api/snapshot?scene=asset&asset=TorusHome_ModA&azimuth=38&elevation=22&distance=17&imageWidth=1280&imageHeight=900
```

Asset-view `azimuth` and `elevation` are in degrees. `distance` is in metres. `modelRotation` is an optional model turn in degrees. Current permitted asset: `TorusHome_ModA`.

`imageWidth` is 320–1920 px; `imageHeight` is 240–1200 px; total area is capped at 2.304 megapixels. The service reuses a headless Chromium process, creates an isolated browser context per request, and allows up to two concurrent renders. Invalid parameters return HTTP 400; a busy renderer returns HTTP 429.

For a local download during model iteration:

```bash
curl -fsS 'http://127.0.0.1:3200/oneillsim/api/snapshot?scene=asset&asset=TorusHome_ModA&azimuth=38&elevation=22&distance=17&imageWidth=1280&imageHeight=900' -o /home/granawkins/.hermes/cache/scratch/torus-home.png
```
