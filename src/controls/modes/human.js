import * as THREE from 'three';
import { supportAt, inTerraceSector } from '../../terrace-surfaces.js';
import { characterColliders } from '../../physics/collider-world.js';
import { CharacterController } from '../../physics/character-controller.js';
import { GROUND_RADIUS } from '../constants.js';
import { yaw, cameraAnchor, moveState, humanState } from '../state.js';

export const humanController = new CharacterController(characterColliders, {
    groundExists: theta => !inTerraceSector(theta)
});
let initialized = false;
const direction = new THREE.Vector3();
const foot = new THREE.Vector3();
const up = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const ray = new THREE.Ray();
const box = new THREE.Box3();
const hit = new THREE.Vector3();

function fromCamera() {
    up.set(-cameraAnchor.position.x, -cameraAnchor.position.y, 0).normalize();
    foot.copy(cameraAnchor.position).addScaledVector(up, -humanController.config.eyeHeight);
    humanController.teleport(foot);
    humanState.jumpRequested = false;
    initialized = true;
}

export function setupHumanMode() {
    // Preserve zoom's highest reachable support selection, now including roofs.
    const pos = cameraAnchor.position, theta = Math.atan2(pos.y, pos.x);
    const support = supportAt(theta, pos.z, 830 - Math.hypot(pos.x, pos.y));
    let height = support?.height ?? null;
    ray.set(pos, up.set(pos.x, pos.y, 0).normalize());
    box.setFromPoints([pos, foot.copy(pos).addScaledVector(up, 130)]).expandByScalar(.01);
    for (const triangle of characterColliders.query(box)) {
        if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) {
            const h = 830 - Math.hypot(hit.x, hit.y);
            if (height === null || h > height) height = h;
        }
    }
    if (height !== null) {
        const radius = GROUND_RADIUS - humanController.config.eyeHeight - height;
        pos.x = radius * Math.cos(theta); pos.y = radius * Math.sin(theta);
    }
    cameraAnchor.rotation.set(0, 0, theta + Math.PI / 2);
    fromCamera();
    syncCamera();
}

function syncCamera() {
    up.copy(humanController.radialUp());
    cameraAnchor.position.copy(humanController.position).addScaledVector(up, humanController.config.eyeHeight);
    const theta = Math.atan2(cameraAnchor.position.y, cameraAnchor.position.x);
    cameraAnchor.rotation.z = theta + Math.PI / 2;
    humanState.floorHeight = 830 - Math.hypot(humanController.position.x, humanController.position.y);
    humanState.currentRadius = Math.hypot(cameraAnchor.position.x, cameraAnchor.position.y);
    humanState.isGrounded = humanController.grounded;
    humanState.radialVelocity = -humanController.velocity.dot(up);
}

export function updateHumanMode(deltaSeconds = 1 / 60) {
    // Lazy initialization leaves URL/capture pose byte-for-byte unchanged until
    // gameplay advances; capture renders remain static without pointer lock.
    if (!initialized) fromCamera();
    const theta = Math.atan2(humanController.position.y, humanController.position.x);
    // Anchor-local yaw: right is ring tangent, forward is negative tube Z.
    right.set(-Math.sin(theta), Math.cos(theta), 0);
    forward.set(0, 0, -1);
    direction.set(0, 0, 0);
    const x = Number(moveState.right) - Number(moveState.left);
    const z = Number(moveState.forward) - Number(moveState.backward);
    direction.addScaledVector(right, x * Math.cos(yaw) - z * Math.sin(yaw));
    direction.addScaledVector(forward, z * Math.cos(yaw) + x * Math.sin(yaw));
    if (direction.lengthSq() > 1) direction.normalize();
    if (humanState.jumpRequested) { humanController.queueJump(); humanState.jumpRequested = false; }
    humanController.advance(deltaSeconds, direction);
    syncCamera();
}
