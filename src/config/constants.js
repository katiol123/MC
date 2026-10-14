// Global, engine-level constants. Gameplay tuning lives in ./tuning.js and in /src/data.
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/** Stage extents in world units (1 unit = 1 px at zoom 1). y = 0 is the floor, y grows upward. */
export const STAGE = { left: 0, right: 2000 };
export const STAGE_CENTER = (STAGE.left + STAGE.right) / 2;

/** Logical render resolution. The canvas is scaled to fit the window. */
export const VIEW = { width: 1280, height: 720, groundY: 640 };

/** Fighters may not drift further apart than the camera can show. */
export const MAX_SEPARATION = 780;
