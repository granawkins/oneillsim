#!/usr/bin/env python3
"""Build the first SP-413-inspired low-poly residence asset and previews.

Run with the host Python environment (requires Pillow + NumPy):
    python3 assets/scripts/build_torus_home_a01.py

The mesh is authored in real metres, normalized by the editor's default scale
(4.0) on OBJ export, and saved as an OBJ/MTL + one shared texture atlas.
This script never edits world.json.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSET_ID = "TorusHome_ModA"
EDITOR_DEFAULT_SCALE = 4.0
ASSET_DIR = ROOT / "assets" / "ultimate-buildings"
ICON_DIR = ROOT / "assets" / "icons" / "ultimate-buildings"
DOC_DIR = ROOT / "docs" / "reference"
ATLAS_PATH = ASSET_DIR / f"{ASSET_ID}_Atlas.png"
OBJ_PATH = ASSET_DIR / f"{ASSET_ID}.obj"
MTL_PATH = ASSET_DIR / f"{ASSET_ID}.mtl"
ICON_PATH = ICON_DIR / f"{ASSET_ID}.png"
PREVIEW_PATH = DOC_DIR / "torus-home-a01-preview.png"
MANIFEST_PATH = ASSET_DIR / f"{ASSET_ID}.asset.json"

# Atlas tiles (column, row), where row 0 is the top row in the PNG.
TILES = {"panel": (0, 0), "glass": (1, 0), "frame": (0, 1), "accent": (1, 1)}
ATLAS_SIZE = 512
TILE_SIZE = ATLAS_SIZE // 2

# Every face is a quad. OBJLoader triangulates them on import; keep one
# material/atlas so each asset stays to one material group.
BOX_FACES = [
    (0, 3, 2, 1),  # -Z
    (4, 5, 6, 7),  # +Z
    (0, 4, 7, 3),  # -X
    (1, 2, 6, 5),  # +X
    (0, 1, 5, 4),  # -Y
    (3, 7, 6, 2),  # +Y
]


def make_atlas() -> Image.Image:
    """Create a compact, hand-authored panel/glass/frame/accent skin atlas."""
    atlas = Image.new("RGB", (ATLAS_SIZE, ATLAS_SIZE), "#dfe3df")
    draw = ImageDraw.Draw(atlas)

    # Reusable exterior wall panel: quiet ivory composite panels and fine seams.
    x0, y0 = 0, 0
    draw.rectangle((x0, y0, x0 + TILE_SIZE - 1, y0 + TILE_SIZE - 1), fill="#e7e7df")
    for x in range(x0 + 30, x0 + TILE_SIZE, 56):
        draw.line((x, y0 + 5, x, y0 + TILE_SIZE - 5), fill="#c6ccc8", width=2)
        draw.line((x + 2, y0 + 6, x + 2, y0 + TILE_SIZE - 6), fill="#f6f5ef", width=1)
    draw.line((x0 + 4, y0 + 20, x0 + TILE_SIZE - 4, y0 + 20), fill="#d3d7d1", width=1)
    draw.line((x0 + 4, y0 + TILE_SIZE - 18, x0 + TILE_SIZE - 4, y0 + TILE_SIZE - 18), fill="#d3d7d1", width=1)

    # Solar-control glazing: deep blue-green with restrained reflected highlights.
    x0, y0 = TILE_SIZE, 0
    draw.rectangle((x0, y0, x0 + TILE_SIZE - 1, y0 + TILE_SIZE - 1), fill="#31576a")
    for j in range(4):
        yy = y0 + 28 + j * 52
        draw.line((x0 + 14, yy, x0 + TILE_SIZE - 16, yy - 5), fill="#76a5b2", width=2)
    draw.polygon([(x0 + 28, y0 + 38), (x0 + 82, y0 + 30), (x0 + 35, y0 + 104)], fill="#4d7888")
    draw.line((x0 + TILE_SIZE - 20, y0 + 6, x0 + TILE_SIZE - 20, y0 + TILE_SIZE - 6), fill="#243e4c", width=3)

    # Exposed lightweight frame and beam faces: cool anodized aluminum.
    x0, y0 = 0, TILE_SIZE
    draw.rectangle((x0, y0, x0 + TILE_SIZE - 1, y0 + TILE_SIZE - 1), fill="#74828a")
    for yy in range(y0 + 18, y0 + TILE_SIZE, 38):
        draw.line((x0 + 6, yy, x0 + TILE_SIZE - 6, yy), fill="#9eaaad", width=2)
        draw.line((x0 + 6, yy + 3, x0 + TILE_SIZE - 6, yy + 3), fill="#5c6971", width=1)

    # A small warm service/entry accent, not a dominant color block.
    x0, y0 = TILE_SIZE, TILE_SIZE
    draw.rectangle((x0, y0, x0 + TILE_SIZE - 1, y0 + TILE_SIZE - 1), fill="#bf7953")
    for x in range(x0 + 22, x0 + TILE_SIZE, 48):
        draw.line((x, y0 + 5, x, y0 + TILE_SIZE - 5), fill="#d99a71", width=2)
    draw.line((x0 + 8, y0 + TILE_SIZE - 20, x0 + TILE_SIZE - 8, y0 + TILE_SIZE - 20), fill="#9f6045", width=2)

    # Thin atlas gutters prevent bilinear filtering from bleeding neighboring tiles.
    draw.line((TILE_SIZE, 0, TILE_SIZE, ATLAS_SIZE), fill="#e1e4df", width=4)
    draw.line((0, TILE_SIZE, ATLAS_SIZE, TILE_SIZE), fill="#e1e4df", width=4)
    return atlas


class Mesh:
    def __init__(self) -> None:
        self.vertices: list[tuple[float, float, float]] = []
        self.quads: list[tuple[tuple[int, int, int, int], str, str]] = []

    def box(self, name: str, center: tuple[float, float, float], size: tuple[float, float, float], tile: str) -> None:
        cx, cy, cz = center
        sx, sy, sz = (v / 2 for v in size)
        base = len(self.vertices)
        self.vertices.extend([
            (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
        ])
        for face in BOX_FACES:
            self.quads.append((tuple(base + i for i in face), tile, name))


def create_house() -> Mesh:
    """A single two-level, set-back home using one 4 x 6 m structural bay."""
    m = Mesh()
    # Datum: floor bottom at y=0; facade faces +Z. Real-world sizes are metres.
    m.box("honeycomb base", (0, 0.06, 0), (4.0, 0.12, 6.0), "frame")

    # Aluminum tube columns: 2 m spacing along the 6 m bay, long sides.
    for x in (-1.94, 1.94):
        for z in (-2.94, 0.0, 2.94):
            m.box("lower frame post", (x, 1.43, z), (0.12, 2.62, 0.12), "frame")

    # Rigid perimeter beams support the next floor; joints remain visually legible.
    beam_y = 2.73
    for z in (-2.94, 2.94):
        m.box("lower perimeter beam", (0, beam_y, z), (4.0, 0.14, 0.14), "frame")
    for x in (-1.94, 1.94):
        m.box("lower perimeter beam", (x, beam_y, 0), (0.14, 0.14, 6.0), "frame")

    # Lower floor-to-ceiling front glazing with non-load-bearing infill panels.
    front_z = 2.89
    m.box("front sill panel", (0, 0.38, front_z), (3.72, 0.48, 0.10), "panel")
    m.box("front header panel", (0, 2.52, front_z), (3.72, 0.34, 0.10), "panel")
    m.box("left front infill", (-1.84, 1.43, front_z), (0.12, 1.66, 0.10), "panel")
    m.box("right front infill", (1.84, 1.43, front_z), (0.12, 1.66, 0.10), "panel")
    m.box("front window", (-0.62, 1.43, front_z + 0.015), (2.30, 1.60, 0.045), "glass")
    m.box("entry door", (1.29, 1.30, front_z + 0.025), (0.88, 1.90, 0.07), "accent")
    m.box("door light", (1.28, 1.90, front_z + 0.066), (0.48, 0.42, 0.018), "glass")
    # Mullions keep the glazing modular rather than a single curtain wall.
    for x in (-1.36, -0.60, 0.16, 0.90):
        m.box("front window mullion", (x, 1.43, front_z + 0.045), (0.035, 1.62, 0.025), "frame")

    # Back wall and paired side walls; each side is divided into panel/window bays.
    rear_z = -2.91
    m.box("rear left panel", (-1.12, 1.42, rear_z), (1.64, 2.52, 0.10), "panel")
    m.box("rear right panel", (1.12, 1.42, rear_z), (1.64, 2.52, 0.10), "panel")
    m.box("rear upper panel", (0, 2.46, rear_z), (0.72, 0.44, 0.10), "panel")
    m.box("rear service window", (0, 1.49, rear_z - 0.02), (0.70, 1.48, 0.035), "glass")
    for side in (-1, 1):
        x = side * 1.91
        m.box("side rear panel", (x, 1.40, -2.05), (0.10, 2.50, 1.70), "panel")
        m.box("side front panel", (x, 1.40, 2.08), (0.10, 2.50, 1.62), "panel")
        m.box("side window", (x, 1.57, 0.02), (0.045, 1.18, 2.35), "glass")
        m.box("side window sill", (x, 0.92, 0.02), (0.13, 0.08, 2.40), "frame")
        m.box("side window head", (x, 2.22, 0.02), (0.13, 0.08, 2.40), "frame")

    # Visible 5 cm honeycomb deck, then a compact upper home module set back
    # to create a useful, walkable front terrace (a model interpretation).
    m.box("honeycomb intermediate deck", (0, 2.82, 0), (3.96, 0.10, 5.94), "frame")
    upper_front = 0.10
    upper_back = -2.91
    upper_mid = (upper_front + upper_back) / 2
    upper_depth = upper_front - upper_back
    upper_height = 2.52
    upper_bottom = 2.92
    upper_top = upper_bottom + upper_height
    upper_center_y = (upper_bottom + upper_top) / 2

    for x in (-1.74, 1.74):
        for z in (upper_back + 0.08, upper_front - 0.08):
            m.box("upper frame post", (x, upper_center_y, z), (0.12, upper_height, 0.12), "frame")
    for z in (upper_back + 0.08, upper_front - 0.08):
        m.box("upper cross beam", (0, upper_top - 0.05, z), (3.60, 0.12, 0.12), "frame")
    for x in (-1.74, 1.74):
        m.box("upper side beam", (x, upper_top - 0.05, upper_mid), (0.12, 0.12, upper_depth), "frame")

    # Upper rear/side infill, plus a generous view window toward the terrace.
    m.box("upper rear wall", (0, upper_center_y, upper_back + 0.10), (3.42, upper_height - 0.12, 0.10), "panel")
    for side in (-1, 1):
        x = side * 1.71
        m.box("upper side wall rear", (x, upper_center_y, -2.12), (0.10, upper_height - 0.12, 1.45), "panel")
        m.box("upper side wall front", (x, upper_center_y, -0.13), (0.10, upper_height - 0.12, 0.48), "panel")
        m.box("upper side glazing", (x, upper_center_y, -1.18), (0.04, 1.25, 1.34), "glass")
    m.box("upper front sill", (0, 3.31, upper_front), (3.42, 0.68, 0.10), "panel")
    m.box("upper front lintel", (0, 5.18, upper_front), (3.42, 0.44, 0.10), "panel")
    m.box("upper terrace door left", (-1.56, 4.27, upper_front), (0.30, 1.24, 0.08), "panel")
    m.box("upper terrace door right", (1.56, 4.27, upper_front), (0.30, 1.24, 0.08), "panel")
    m.box("upper front glazing", (0, 4.27, upper_front + 0.02), (2.76, 1.24, 0.04), "glass")
    for x in (-1.05, 0.0, 1.05):
        m.box("upper glazing mullion", (x, 4.27, upper_front + 0.05), (0.04, 1.24, 0.03), "frame")

    # Roof panel is also a usable deck; roof panel and frame are separate parts.
    m.box("upper walkable roof panel", (0, upper_top + 0.02, upper_mid), (3.84, 0.12, upper_depth + 0.12), "panel")
    m.box("roof edge beam", (0, upper_top - 0.02, upper_front - 0.02), (3.82, 0.14, 0.12), "frame")

    # Guardrail sits on the terrace deck and its side runs meet the house walls.
    terrace_deck_top = 2.82 + 0.10 / 2
    rail_height = 1.02
    terrace_front_z = 2.82
    terrace_side_length = terrace_front_z - upper_front
    terrace_side_mid_z = (upper_front + terrace_front_z) / 2
    rail_y = terrace_deck_top + rail_height / 2
    rail_half_width = 1.75
    for x in (-rail_half_width, -rail_half_width / 3, rail_half_width / 3, rail_half_width):
        m.box("terrace front rail post", (x, rail_y, terrace_front_z), (0.06, rail_height, 0.06), "frame")
    m.box("terrace front top rail", (0, rail_y + rail_height / 2 - 0.02, terrace_front_z), (2 * rail_half_width, 0.07, 0.07), "frame")
    m.box("terrace front mid rail", (0, rail_y + 0.02, terrace_front_z), (2 * rail_half_width, 0.05, 0.05), "frame")
    for side in (-1, 1):
        x = side * rail_half_width
        for z in (upper_front, terrace_side_mid_z, terrace_front_z):
            m.box("terrace side rail post", (x, rail_y, z), (0.06, rail_height, 0.06), "frame")
        m.box("terrace side top rail", (x, rail_y + rail_height / 2 - 0.02, terrace_side_mid_z), (0.07, 0.07, terrace_side_length), "frame")

    # Integrated service core (bath/utility pack) reads as a removable prefab unit.
    m.box("integrated service core", (1.12, 1.33, -2.12), (1.22, 2.34, 1.30), "accent")
    m.box("service core access panel", (1.12, 1.36, -1.44), (0.72, 1.86, 0.025), "panel")

    # Three low, wide steps and a compact landing lead to the entry.
    for i in range(3):
        rise = 0.16 * (i + 1)
        z = 3.12 + i * 0.30
        m.box("entry stair", (1.30, rise / 2, z), (1.05, rise, 0.32), "frame")
    m.box("entry landing", (1.30, 0.08, 4.15), (1.35, 0.16, 0.58), "panel")
    return m


def tile_uv(tile: str) -> tuple[float, float, float, float]:
    col, row = TILES[tile]
    gutter = 0.025
    u0 = col * 0.5 + gutter
    u1 = (col + 1) * 0.5 - gutter
    # OBJ v=0 is the bottom of the image; invert the row index.
    v1 = 1.0 - row * 0.5 - gutter
    v0 = 1.0 - (row + 1) * 0.5 + gutter
    return u0, v0, u1, v1


def export_obj(mesh: Mesh) -> tuple[int, int]:
    lines = [f"mtllib {MTL_PATH.name}", f"o {ASSET_ID}", "usemtl HabitatAtlas"]
    for x, y, z in mesh.vertices:
        lines.append(f"v {x / EDITOR_DEFAULT_SCALE:.6f} {y / EDITOR_DEFAULT_SCALE:.6f} {z / EDITOR_DEFAULT_SCALE:.6f}")
    tex_index = 1
    uv_index_faces: list[list[int]] = []
    for _, tile, _ in mesh.quads:
        u0, v0, u1, v1 = tile_uv(tile)
        values = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
        ids = []
        for u, v in values:
            lines.append(f"vt {u:.6f} {v:.6f}")
            ids.append(tex_index)
            tex_index += 1
        uv_index_faces.append(ids)
    for (vertex_ids, _tile, _name), uv_ids in zip(mesh.quads, uv_index_faces):
        face = " ".join(f"{v + 1}/{uv}" for v, uv in zip(vertex_ids, uv_ids))
        lines.append(f"f {face}")
    OBJ_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    MTL_PATH.write_text(
        "# TorusHome_ModA — one shared habitat atlas material\n"
        "newmtl HabitatAtlas\n"
        "Ka 1.000000 1.000000 1.000000\n"
        "Kd 1.000000 1.000000 1.000000\n"
        "Ks 0.080000 0.080000 0.080000\n"
        "Ns 24.000000\n"
        "d 1.000000\n"
        "illum 2\n"
        f"map_Kd {ATLAS_PATH.name}\n",
        encoding="utf-8",
    )
    return len(mesh.vertices), len(mesh.quads) * 2


def project_factory(target: np.ndarray, camera: np.ndarray, center_xy: tuple[float, float], scale: float):
    forward = target - camera
    forward = forward / np.linalg.norm(forward)
    right = np.cross(forward, np.array([0.0, 1.0, 0.0]))
    right = right / np.linalg.norm(right)
    up = np.cross(right, forward)
    def project(point):
        delta = np.asarray(point, dtype=float) - target
        return (center_xy[0] + np.dot(delta, right) * scale,
                center_xy[1] - np.dot(delta, up) * scale)
    return project, forward


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def affine_textured_triangle(canvas: Image.Image, atlas: Image.Image, points, uvs, brightness: float, supersample: int) -> None:
    """Map one atlas triangle onto an orthographically projected triangle."""
    screen = np.array([(x * supersample, y * supersample) for x, y in points], dtype=float)
    uv = np.array(uvs, dtype=float)
    src = np.column_stack((uv[:, 0] * (atlas.width - 1), (1.0 - uv[:, 1]) * (atlas.height - 1)))
    matrix = np.column_stack((screen, np.ones(3)))
    try:
        coeff = np.linalg.solve(matrix, src)
    except np.linalg.LinAlgError:
        return
    left = max(0, int(math.floor(screen[:, 0].min())))
    top = max(0, int(math.floor(screen[:, 1].min())))
    right = min(canvas.width, int(math.ceil(screen[:, 0].max())) + 1)
    bottom = min(canvas.height, int(math.ceil(screen[:, 1].max())) + 1)
    if right <= left or bottom <= top:
        return
    width, height = right - left, bottom - top
    a, b, c = coeff[:, 0]
    d, e, f = coeff[:, 1]
    transform = (a, b, c + a * left + b * top, d, e, f + d * left + e * top)
    patch = atlas.transform((width, height), Image.Transform.AFFINE, transform, resample=Image.Resampling.BICUBIC)
    shade = Image.new("RGB", (width, height), (int(255 * brightness),) * 3)
    patch = ImageChops.multiply(patch, shade)
    mask = Image.new("L", (width, height), 0)
    md = ImageDraw.Draw(mask)
    local = [(int(x - left), int(y - top)) for x, y in screen]
    md.polygon(local, fill=255)
    canvas.paste(patch, (left, top), mask)


def render_scene(mesh: Mesh, atlas: Image.Image, width: int, height: int, title: bool) -> Image.Image:
    ss = 2
    W, H = width * ss, height * ss
    canvas = Image.new("RGB", (W, H), "#e7edf0")
    pix = canvas.load()
    for y in range(H):
        t = y / max(1, H - 1)
        upper = np.array((232, 241, 244), dtype=float)
        lower = np.array((207, 216, 216), dtype=float)
        color = tuple(int(v) for v in upper * (1 - t) + lower * t)
        for x in range(W):
            pix[x, y] = color

    # Camera: front (+Z) and right (+X) elevations, slightly above the roof.
    target = np.array([0.0, 2.4, 0.0])
    camera = np.array([8.8, 7.7, 10.8])
    forward = target - camera
    forward /= np.linalg.norm(forward)
    right_vec = np.cross(forward, np.array([0.0, 1.0, 0.0]))
    right_vec /= np.linalg.norm(right_vec)
    up_vec = np.cross(right_vec, forward)

    # Fit projected silhouette in the lower central area.
    allp = np.array(mesh.vertices)
    projected_x = (allp - target) @ right_vec
    projected_y = (allp - target) @ up_vec
    span_x = max(projected_x) - min(projected_x)
    span_y = max(projected_y) - min(projected_y)
    view_h = height * (0.68 if title else 0.80)
    view_w = width * 0.73
    scale = min(view_w / span_x, view_h / span_y)
    cx = width * 0.51
    cy = height * (0.58 if title else 0.56)
    project, view_direction = project_factory(target, camera, (cx, cy), scale)

    # Subtle one-metre ground grid provides scale without turning the render into a diagram.
    draw = ImageDraw.Draw(canvas, "RGB")
    for v in range(-6, 7):
        color = "#c8d0d0" if v % 2 == 0 else "#d3d9d9"
        a = project((v, 0.005, -6))
        b = project((v, 0.005, 6))
        c = project((-6, 0.005, v))
        d = project((6, 0.005, v))
        draw.line((tuple(int(q * ss) for q in a), tuple(int(q * ss) for q in b)), fill=color, width=1 * ss)
        draw.line((tuple(int(q * ss) for q in c), tuple(int(q * ss) for q in d)), fill=color, width=1 * ss)

    # Soft polygon shadow under the structural footprint.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    shadow_corners = [project((x, 0.015, z)) for x, z in [(-2.4, -3.1), (2.3, -3.1), (2.5, 4.25), (-2.4, 4.25)]]
    sd.polygon([(int(x * ss), int(y * ss)) for x, y in shadow_corners], fill=(41, 53, 58, 44))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")

    light = np.array([0.45, 0.86, 0.36], dtype=float)
    light /= np.linalg.norm(light)
    triangles = []
    uv_corners = []
    for vertex_ids, tile, _name in mesh.quads:
        u0, v0, u1, v1 = tile_uv(tile)
        uvq = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        quad_points = [mesh.vertices[i] for i in vertex_ids]
        edge_a = np.array(quad_points[1]) - np.array(quad_points[0])
        edge_b = np.array(quad_points[2]) - np.array(quad_points[0])
        normal = np.cross(edge_a, edge_b)
        length = np.linalg.norm(normal)
        if length == 0:
            continue
        normal /= length
        center = np.mean(np.asarray(quad_points), axis=0)
        if np.dot(normal, camera - center) <= 0:
            continue
        brightness = 0.60 + 0.36 * max(0.0, float(np.dot(normal, light)))
        for tri_ids in ((0, 1, 2), (0, 2, 3)):
            pts = [quad_points[j] for j in tri_ids]
            uvp = [uvq[j] for j in tri_ids]
            depth = float(np.dot(np.asarray(pts).mean(axis=0) - camera, forward))
            triangles.append((depth, pts, uvp, brightness))

    # Painter's order for this product-sheet preview; the OBJ itself is the real asset.
    for _depth, pts3, uvp, brightness in sorted(triangles, key=lambda x: x[0], reverse=True):
        pts2 = [project(p) for p in pts3]
        affine_textured_triangle(canvas, atlas, pts2, uvp, brightness, ss)
    canvas = canvas.resize((width, height), Image.Resampling.LANCZOS)
    d = ImageDraw.Draw(canvas)
    if title:
        d.text((64, 42), "TORUS HABITAT  /  RESIDENCE A-01", fill="#243943", font=font(28))
        d.text((66, 82), "MODULAR TERRACE HOME  •  SP-413-INSPIRED STUDY MODEL", fill="#5b6c72", font=font(16))
        d.line((64, 119, width - 64, 119), fill="#a9b7b9", width=2)
        footer_y = height - 66
        d.line((64, footer_y - 18, width - 64, footer_y - 18), fill="#a9b7b9", width=2)
        text = "4 × 6 m FRAME BAY    •    2 LEVELS    •    1 ATLAS MATERIAL    •    WALKABLE ROOF TERRACE"
        d.text((66, footer_y), text, fill="#344a53", font=font(15))
        d.text((width - 270, height - 34), "ARTIST'S INTERPRETATION", fill="#718187", font=font(12))
    return canvas


def write_atlas_material(atlas: Image.Image) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PATH, optimize=True)


def main() -> None:
    atlas = make_atlas()
    mesh = create_house()
    write_atlas_material(atlas)
    vertex_count, triangle_count = export_obj(mesh)
    render_scene(mesh, atlas, 1440, 1080, title=True).save(PREVIEW_PATH, optimize=True)
    render_scene(mesh, atlas, 512, 512, title=False).save(ICON_PATH, optimize=True)

    actual_bounds = []
    for axis in range(3):
        values = [v[axis] for v in mesh.vertices]
        actual_bounds.append([round(min(values), 3), round(max(values), 3)])
    manifest = {
        "id": ASSET_ID,
        "displayName": "Modular Terrace Home A-01",
        "description": "One two-level, set-back residence using a 4 x 6 m structural bay.",
        "source": "NASA SP-413, Figures 4-8 and 5-5 to 5-7; Appendix B, Structural System for Housing.",
        "sourceFacts": [
            "Figure 4-8 shows a light modular frame with non-load-bearing wall panels, floor/roof panels, shades and packaged service modules.",
            "Appendix B describes a typical 4 x 6 m aluminum-tube structural bay, beams at 2 m centers, and 5 cm honeycomb floor panels.",
            "Figures 5-5 to 5-7 show varied one- and two-level homes and terraced housing; the illustrations are conceptual rather than dimensioned construction drawings.",
        ],
        "interpretations": [
            "Two-storey set-back arrangement, glazing layout, stair, rail dimensions and 2.7 m nominal storey heights are this asset's authored choices.",
            "OBJ coordinates are normalized for the editor's default scale 4.0; placement at that scale gives an approximate 4 x 6 m footprint and 5.5 m total height.",
        ],
        "editorDefaultScale": EDITOR_DEFAULT_SCALE,
        "actualModelBoundsMeters": actual_bounds,
        "vertices": vertex_count,
        "quads": len(mesh.quads),
        "trianglesAfterQuadTriangulation": triangle_count,
        "materials": 1,
        "textureAtlas": ATLAS_PATH.name,
        "worldJsonChanged": False,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "assetId": ASSET_ID,
        "obj": str(OBJ_PATH),
        "mtl": str(MTL_PATH),
        "atlas": str(ATLAS_PATH),
        "icon": str(ICON_PATH),
        "preview": str(PREVIEW_PATH),
        "manifest": str(MANIFEST_PATH),
        "vertices": vertex_count,
        "quads": len(mesh.quads),
        "triangles": triangle_count,
        "boundsMeters": actual_bounds,
        "worldJsonChanged": False,
    }, indent=2))


if __name__ == "__main__":
    main()
