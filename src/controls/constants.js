// Movement constants
export const MOVE_SPEED = 1.2;
export const MOUSE_SENSITIVITY = 0.002;

// Ground/player constants
export const GROUND_RADIUS = 649.8;
export const CAMERA_HEIGHT = 2;
export const PLAYER_RADIUS = GROUND_RADIUS - CAMERA_HEIGHT;

// Jump physics
export const JUMP_VELOCITY = 0.4;
export const GRAVITY = 0.015;

// Planner mode constants
export const PLANNER_DEFAULT_HEIGHT = 50;  // meters above ground
export const PLANNER_MIN_HEIGHT = 10;
export const PLANNER_MAX_HEIGHT = 200;
export const PLANNER_ZOOM_SPEED = 5;
export const PLANNER_MOVE_SPEED = 0.003;  // radians per frame for ring movement

// God mode constants
export const GOD_MOVE_SPEED = MOVE_SPEED * 5;  // Faster movement in god mode

// Transition constants
export const TRANSITION_SPEED = 0.08;

// Z constraint
export const Z_LIMIT = 60;
