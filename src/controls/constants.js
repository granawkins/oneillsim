import { GROUND_RADIUS } from '../cylinder.js';
import { CHARACTER } from '../physics/character-controller.js';
export { GROUND_RADIUS };

// Movement constants
export const MOVE_SPEED = 1.2;
export const HUMAN_MOVE_SPEED = CHARACTER.speed; // metres / second
export const MOUSE_SENSITIVITY = 0.002;

// Ground/player constants
export const CAMERA_HEIGHT = 2;
export const PLAYER_RADIUS = GROUND_RADIUS - CAMERA_HEIGHT;

// Human physics uses SI units; planner/god retain their existing frame-based UX.
export const JUMP_VELOCITY = CHARACTER.jumpSpeed;
export const GRAVITY = CHARACTER.gravity;

// Planner mode constants
export const PLANNER_DEFAULT_HEIGHT = 50;  // meters above ground
export const PLANNER_MIN_HEIGHT = 10;
export const PLANNER_MAX_HEIGHT = 200;
export const PLANNER_ZOOM_HEIGHT_SPEED = 5;  // meters per scroll
export const PLANNER_ZOOM_THETA_SPEED = 0.003;  // radians per scroll (backward when zooming out)
export const PLANNER_MOVE_SPEED = 0.003;  // radians per frame for ring movement

// God mode constants
export const GOD_MOVE_SPEED = MOVE_SPEED * 5;  // Faster movement in god mode
export const GOD_ENTRY_SPEED = 2;  // Initial speed when entering god mode from planner
export const GOD_ACCELERATION = 0.05;  // How fast god mode accelerates to full speed

// Transition constants
export const TRANSITION_DURATION = 1000;  // ms for god→planner transition

// Z constraint
export const Z_LIMIT = 60;
