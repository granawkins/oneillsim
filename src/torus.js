import * as THREE from 'three';
import { CYLINDER_RADIUS, CYLINDER_LENGTH } from './cylinder.js';

// Torus dimensions
const RING_RADIUS = CYLINDER_RADIUS;  // 650 - distance from origin to tube center
const TUBE_RADIUS = CYLINDER_LENGTH / 2;  // 65 - radius of the tube cross-section

let innerTorusMesh = null;
let outerTorusMesh = null;

/**
 * Create half-torus geometry.
 *
 * The torus ring is in the XY plane (horizontal), centered at origin.
 * The ring encircles the Z axis - like a donut lying flat.
 *
 * Parametric equations:
 *   x = (R + r*cos(φ))*cos(θ)
 *   y = (R + r*cos(φ))*sin(θ)
 *   z = r*sin(φ)
 *
 * Where R = ring radius (650), r = tube radius (65)
 * θ = angle around the ring (0 to 2π)
 * φ = angle around the tube cross-section
 *
 * Distance from Z axis = R + r*cos(φ)
 *   - At φ=0: R+r = 715 (outer surface, farthest from Z axis)
 *   - At φ=π: R-r = 585 (inner surface, closest to Z axis)
 *
 * Player at radius 647.8 from Z axis is inside the tube.
 * "Down" for player = away from Z axis = larger radius = toward outer surface
 *
 * φ ranges:
 *   -π/2 to π/2: outer half (φ where cos(φ)>0, farther from Z axis), below ground
 *   π/2 to 3π/2: inner half (φ where cos(φ)<0, closer to Z axis), above ground
 */
function createHalfTorusGeometry(ringRadius, tubeRadius, ringSegments, tubeSegments, phiStart, phiEnd) {
    const R = ringRadius;
    const r = tubeRadius;

    const phiRange = phiEnd - phiStart;
    const phiSegs = Math.ceil(tubeSegments * Math.abs(phiRange) / (2 * Math.PI));

    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    // Generate vertices
    for (let i = 0; i <= ringSegments; i++) {
        const theta = (i / ringSegments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        for (let j = 0; j <= phiSegs; j++) {
            const phi = phiStart + (j / phiSegs) * phiRange;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            // Position on torus surface (ring in XY plane, encircling Z axis)
            const x = (R + r * cosPhi) * cosTheta;
            const y = (R + r * cosPhi) * sinTheta;
            const z = r * sinPhi;

            vertices.push(x, y, z);

            // Normal (pointing outward from tube surface)
            const nx = cosPhi * cosTheta;
            const ny = cosPhi * sinTheta;
            const nz = sinPhi;
            normals.push(nx, ny, nz);

            // UVs
            const u = i / ringSegments;
            const v = j / phiSegs;
            uvs.push(u, v);
        }
    }

    // Generate indices
    for (let i = 0; i < ringSegments; i++) {
        for (let j = 0; j < phiSegs; j++) {
            const a = i * (phiSegs + 1) + j;
            const b = (i + 1) * (phiSegs + 1) + j;
            const c = (i + 1) * (phiSegs + 1) + j + 1;
            const d = i * (phiSegs + 1) + j + 1;

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    return geometry;
}

export function createTorus(habitatGroup) {
    const steelMaterial = new THREE.MeshStandardMaterial({
        color: 0x888899,  // Steel grey
        metalness: 0.6,
        roughness: 0.5,
        side: THREE.DoubleSide
    });

    // Outer half (below ground) - always visible
    // φ from -π/2 to π/2: the half where cos(φ) > 0 (facing away from Z axis)
    const outerGeo = createHalfTorusGeometry(RING_RADIUS, TUBE_RADIUS, 96, 24, -Math.PI / 2, Math.PI / 2);
    outerTorusMesh = new THREE.Mesh(outerGeo, steelMaterial);
    habitatGroup.add(outerTorusMesh);

    // Inner half (above ground) - toggleable, hidden by default
    // φ from π/2 to 3π/2: the half where cos(φ) < 0 (facing toward Z axis)
    // This part ranges from radius 587 to 652, so it's "above" ground level
    const innerGeo = createHalfTorusGeometry(RING_RADIUS, TUBE_RADIUS, 96, 24, Math.PI / 2, 3 * Math.PI / 2);
    innerTorusMesh = new THREE.Mesh(innerGeo, steelMaterial.clone());
    innerTorusMesh.visible = false;  // Hidden by default
    habitatGroup.add(innerTorusMesh);

    return { innerTorusMesh, outerTorusMesh };
}

export function setInnerTorusVisible(visible) {
    if (innerTorusMesh) {
        innerTorusMesh.visible = visible;
    }
}

export function getInnerTorusVisible() {
    return innerTorusMesh ? innerTorusMesh.visible : true;
}
