#!/usr/bin/env python3
"""Authored, deterministic, periodic 4 m interior surfaces. No source imagery.
Requires Python 3, NumPy and Pillow; runtime uses only the checked-in PNGs.
Run from anywhere; --output may target a scratch directory for reproducibility.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 512
SEED = 4132026
TILE_METRES = 4


def field(rng, nx, ny):
    """Periodic interpolated value noise, sampled with shared endpoint texels."""
    grid = rng.uniform(-1, 1, (ny, nx))
    x = np.linspace(0, nx, SIZE, endpoint=True)
    y = np.linspace(0, ny, SIZE, endpoint=True)
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = grid[iy[:, None] % ny, ix[None, :] % nx]
    b = grid[iy[:, None] % ny, (ix[None, :] + 1) % nx]
    c = grid[(iy[:, None] + 1) % ny, ix[None, :] % nx]
    d = grid[(iy[:, None] + 1) % ny, (ix[None, :] + 1) % nx]
    return (a * (1 - fx) + b * fx) * (1 - fy[:, None]) + (c * (1 - fx) + d * fx) * fy[:, None]


def surfaces():
    rng = np.random.default_rng(SEED)
    yy, xx = np.meshgrid(np.linspace(0, 4, SIZE), np.linspace(0, 4, SIZE), indexing='ij')
    broad = field(rng, 6, 6)
    medium = field(rng, 36, 36)
    fine = field(rng, 180, 180)
    # Crossed fine fibres, not a conspicuous mowing stripe or green photo tint.
    fibres = .65 * field(rng, 220, 62) + .35 * field(rng, 74, 212)
    grass = 226 + 12 * broad + 10 * medium + 17 * fibres
    grass_height = .5 + .09 * medium + .22 * fibres
    grass_rough = .94 + .035 * broad + .025 * fibres
    yield 'grass', grass, grass_height, grass_rough, .018

    # Quiet lime concrete: soft mineral clouds, aggregate and scattered pin pores.
    pores = np.maximum(0, -fine - .42) * 2.4
    concrete = 238 + 7 * broad + 5 * medium + 5 * fine - 17 * pores
    concrete_height = .53 + .035 * medium + .035 * fine - .19 * pores
    concrete_rough = .87 + .045 * medium + .055 * pores
    yield 'concrete', concrete, concrete_height, concrete_rough, .006

    # Honed warm stone setts, 1 m x .5 m, staggered courses, 12 mm joints.
    # Coordinates are authored in metres, so the pattern is independent of parcels.
    row = np.floor((yy % 4) / .5).astype(int)
    sx = (xx + (row % 2) * .5) % 1
    sy = yy % .5
    edge = np.minimum(np.minimum(sx, 1 - sx), np.minimum(sy, .5 - sy))
    joint = np.clip((.018 - edge) / .012, 0, 1)
    # A deterministic, periodic individual stone tone; no hard bright checkerboard.
    tones = rng.uniform(-5, 5, (8, 4))
    slab = tones[row % 8, np.floor((xx + (row % 2) * .5) % 4).astype(int)]
    paving = 235 + slab + 5 * broad + 4 * medium + 3 * fine - 30 * joint
    paving_height = .64 + .025 * medium + .025 * fine - .39 * joint
    paving_rough = .84 + .04 * medium + .1 * joint
    yield 'paving', paving, paving_height, paving_rough, .012


def write(output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'seed': SEED, 'size': SIZE, 'tileMetres': TILE_METRES,
                'provenance': 'Original procedural authoring; no external images or licenses.',
                'channels': {'color': 'sRGB neutral multiplier', 'surface': 'R: linear bump height, G: linear roughness, B: reserved (255)'},
                'surfaces': {}}
    for name, color, height, roughness, bump_scale in surfaces():
        color = np.stack([color, color - .6, color - 1.8], axis=-1)
        packed = np.stack([height * 255, roughness * 255, np.full_like(height, 255)], axis=-1)
        entry = {'bumpScale': bump_scale, 'files': {}}
        for suffix, pixels in [('color', color), ('surface', packed)]:
            pixels = np.uint8(np.clip(np.rint(pixels), 0, 255))
            # Exact repeated border values, including the staggered paving corner.
            pixels[-1, :, :] = pixels[0, :, :]
            pixels[:, -1, :] = pixels[:, 0, :]
            filename = f'{name}-{suffix}.png'
            path = output / filename
            Image.fromarray(pixels).save(path, optimize=False, compress_level=9)
            entry['files'][suffix] = {'name': filename, 'bytes': path.stat().st_size,
                                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        manifest['surfaces'][name] = entry
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'textures/interior-lookdev')
    write(parser.parse_args().output)
