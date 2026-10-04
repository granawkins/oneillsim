import * as THREE from 'three';

export const CHARACTER = Object.freeze({ radius: .35, height: 2, eyeHeight: 1.65, speed: 15, jumpSpeed: 5 * Math.SQRT2,
    gravity: 9.32, stepHeight: .3, fixedDelta: 1 / 120, maxFrameDelta: .25,
    majorRadius: 830, tubeRadius: 65 });
const SKIN = 1e-5;

// Two-sided capsule/triangle closest points. The minimum is an endpoint/face,
// segment/edge pair, or a segment piercing the face. Three's Ray kernels also
// handle parallel edges; no triangle winding or rendering material dependency.
class CapsuleContact {
    constructor() {
        this.ray = new THREE.Ray();
        this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
        this.onAxis = new THREE.Vector3(); this.onTriangle = new THREE.Vector3();
        this.normal = new THREE.Vector3();
        this.closestAxis = new THREE.Vector3(); this.closestTriangle = new THREE.Vector3();
    }
    distance(start, end, triangle) {
        const length = start.distanceTo(end);
        this.ray.set(start, this.normal.subVectors(end, start).normalize());
        if (this.ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, this.a)
            && this.a.distanceToSquared(start) <= length * length) {
            this.closestAxis.copy(this.a); this.closestTriangle.copy(this.a);
            return 0;
        }
        let best = Infinity;
        const accept = (axis, surface) => {
            const distance = axis.distanceToSquared(surface);
            if (distance < best) { best = distance; this.closestAxis.copy(axis); this.closestTriangle.copy(surface); }
        };
        triangle.closestPointToPoint(start, this.b); accept(start, this.b);
        triangle.closestPointToPoint(end, this.b); accept(end, this.b);
        const vertices = [triangle.a, triangle.b, triangle.c];
        for (let i = 0; i < 3; i++) {
            this.ray.distanceSqToSegment(vertices[i], vertices[(i + 1) % 3], this.a, this.b);
            if (this.a.distanceToSquared(start) <= length * length + 1e-10) accept(this.a, this.b);
        }
        return Math.sqrt(best);
    }
}

// Foot position and all velocities are habitat-local, in metres and seconds.
// Radial up varies with position; gravity is centrifugal g(r)=g(830)*r/830.
export class CharacterController {
    constructor(world, { groundExists = () => true, ...options } = {}) {
        this.world = world; this.config = { ...CHARACTER, ...options };
        this.groundExists = groundExists;
        this.position = new THREE.Vector3(this.config.majorRadius, 0, 0);
        this.velocity = new THREE.Vector3();
        this.grounded = false; this.accumulator = 0; this.jumpQueued = false;
        this.up = new THREE.Vector3(); this.start = new THREE.Vector3(); this.end = new THREE.Vector3();
        this.box = new THREE.Box3(); this.contact = new CapsuleContact();
        this._normal = new THREE.Vector3(); this._delta = new THREE.Vector3();
        this._old = new THREE.Vector3(); this._baseline = new THREE.Vector3();
        this._baselineVelocity = new THREE.Vector3(); this._input = new THREE.Vector3();
        this.steps = 0;
    }
    teleport(foot) {
        this.position.copy(foot); this.velocity.set(0, 0, 0);
        this.grounded = false; this.accumulator = 0; this.jumpQueued = false;
        this.resolve();
    }
    queueJump() { this.jumpQueued = true; }
    radialUp() { return this.up.set(-this.position.x, -this.position.y, 0).normalize(); }
    capsule() {
        const { radius, height } = this.config;
        this.radialUp();
        this.start.copy(this.position).addScaledVector(this.up, radius);
        this.end.copy(this.position).addScaledVector(this.up, height - radius);
        this.box.setFromPoints([this.start, this.end]).expandByScalar(radius + SKIN);
    }
    clip(normal) {
        const verticalBefore = this.velocity.dot(this.up);
        const into = this.velocity.dot(normal);
        if (into < 0) {
            this.velocity.addScaledVector(normal, -into);
            // Kinematic stair/slope depenetration may lift the feet, but must
            // not convert commanded horizontal speed into a ballistic jump.
            // Preserve real upward jump velocity; cancel only contact-created lift.
            if (normal.dot(this.up) > 0) {
                const extraLift = this.velocity.dot(this.up) - Math.max(0, verticalBefore);
                if (extraLift > 0) this.velocity.addScaledVector(this.up, -extraLift);
            }
        }
        if (normal.dot(this.up) > .65) this.grounded = true;
    }
    resolve() {
        const { radius, majorRadius, tubeRadius } = this.config;
        // Iterative contacts handle corners, ceilings and wall sliding.
        for (let pass = 0; pass < 5; pass++) {
            this.capsule();
            let changed = false;
            const candidates = this.world.query(this.box);
            for (const triangle of candidates) {
                const distance = this.contact.distance(this.start, this.end, triangle);
                if (distance >= radius) continue;
                const n = this._normal.subVectors(this.contact.closestAxis, this.contact.closestTriangle);
                if (distance > 1e-9) n.multiplyScalar(1 / distance);
                else {
                    triangle.getNormal(n);
                    // Extremely rare exact piercing: choose the pre-motion side.
                    if (n.dot(this.velocity) > 0) n.negate();
                }
                this.position.addScaledVector(n, radius - distance + SKIN);
                this.clip(n); changed = true;
                this.capsule();
            }
            // Exact ground sheet, not its ~78k rendering triangles.
            const r = Math.hypot(this.position.x, this.position.y);
            if (this.groundExists(Math.atan2(this.position.y, this.position.x), this.position.z)
                && r >= majorRadius - SKIN) {
                this.position.addScaledVector(this.up, r - majorRadius + SKIN);
                this.clip(this.up); changed = true;
            }
            // Each sphere at the capsule ends must lie inside the circular tube.
            // Their entire radial segment is inside the convex cross-section too.
            this.capsule();
            for (const p of [this.start, this.end]) {
                const radial = Math.hypot(p.x, p.y), q = radial - majorRadius;
                const cross = Math.hypot(q, p.z), limit = tubeRadius - radius;
                if (cross <= limit) continue;
                this._normal.set(-p.x / radial * q / cross, -p.y / radial * q / cross, -p.z / cross);
                this.position.addScaledVector(this._normal, cross - limit + SKIN);
                this.clip(this._normal); changed = true;
                this.capsule();
            }
            if (!changed) break;
        }
    }
    // Fixed time plus bounded travel increments protects even zero-thickness walls
    // on slow frames and terminal falls. No dropped frame becomes a giant sweep.
    move(delta) {
        const count = Math.max(1, Math.ceil(delta.length() / (this.config.radius * .4)));
        for (let i = 0; i < count; i++) {
            this.position.addScaledVector(delta, 1 / count);
            this.resolve();
        }
    }
    clear() {
        this.capsule();
        return this.world.query(this.box).every(t => this.contact.distance(this.start, this.end, t) >= this.config.radius - SKIN);
    }
    tick(direction) {
        const c = this.config, dt = c.fixedDelta;
        const wasGrounded = this.grounded;
        const vertical = this.velocity.dot(this.radialUp());
        this._input.copy(direction).addScaledVector(this.up, -direction.dot(this.up));
        if (this._input.lengthSq() > 1) this._input.normalize();
        this.velocity.copy(this._input).multiplyScalar(c.speed).addScaledVector(this.up, vertical);
        let jumped = false;
        if (this.jumpQueued) {
            if (wasGrounded) { this.velocity.addScaledVector(this.up, c.jumpSpeed - vertical); jumped = true; }
            this.jumpQueued = false;
        }
        this.velocity.addScaledVector(this.up, -c.gravity * Math.hypot(this.position.x, this.position.y) / c.majorRadius * dt);
        this._old.copy(this.position);
        this._delta.copy(this.velocity).multiplyScalar(dt);
        this.grounded = false;
        this.move(this._delta);
        // Try an actual clearance-checked step, not a floor-height teleport. Never
        // step while airborne or trade a cliff fall for a floating position.
        const desired = this._input.length() * c.speed * dt;
        const progress = this.position.clone().sub(this._old).dot(this._input.clone().normalize());
        if (wasGrounded && !jumped && desired > 0 && progress < desired * .85) {
            this._baseline.copy(this.position); this._baselineVelocity.copy(this.velocity);
            const baselineGrounded = this.grounded;
            this.position.copy(this._old).addScaledVector(this.radialUp(), c.stepHeight);
            if (this.clear()) {
                this.velocity.copy(this._input).multiplyScalar(c.speed);
                this.grounded = false;
                this.move(this._delta.copy(this.velocity).multiplyScalar(dt));
                if (this.clear()) {
                    this.move(this._delta.copy(this.radialUp()).multiplyScalar(-c.stepHeight - .02));
                    const steppedProgress = this.position.clone().sub(this._old).dot(this._input.clone().normalize());
                    if (this.grounded && steppedProgress > progress + SKIN) { this.steps++; return; }
                }
            }
            this.position.copy(this._baseline); this.velocity.copy(this._baselineVelocity); this.grounded = baselineGrounded;
        }
        this.steps++;
    }
    advance(deltaSeconds, direction = new THREE.Vector3()) {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
        this.accumulator += Math.min(deltaSeconds, this.config.maxFrameDelta);
        let count = 0;
        while (this.accumulator + 1e-12 >= this.config.fixedDelta) {
            this.tick(direction); this.accumulator -= this.config.fixedDelta; count++;
        }
        return count;
    }
}
