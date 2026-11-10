/**
 * async.ts - Micro-scheduling helpers so busy states actually paint before
 * heavy synchronous work blocks the main thread.
 */

/** Resolves after a paint frame + a macrotask, allowing the UI to repaint. */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}
