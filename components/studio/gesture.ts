/** Non-reactive flag shared by the scene and the walk-input hook: an item is being grabbed, so the camera must not move. */
export const gesture = { itemActive: false, /** performance.now() until which a click on the shell is ignored (the click that ends a drag) */ suppressClickUntil: 0 };
