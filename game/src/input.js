// input.js — keyboard state for the whole game. Held keys are read as a set
// every simulation step; one-shot presses (pause, mute, radio, confirm) are
// queued as flags and consumed once, so a tap between frames is never lost
// and never fires twice.

const HELD = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

const PRESS_FLAGS = {
  KeyE: 'interact',
  KeyF: 'punch',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
  KeyN: 'radio',
  Enter: 'confirm',
};

export function createInput() {
  const down = new Set();
  const pressed = new Set();

  window.addEventListener('keydown', (event) => {
    if (HELD.has(event.code)) {
      down.add(event.code);
      event.preventDefault();
    }
    const flag = PRESS_FLAGS[event.code];
    if (flag && !event.repeat) pressed.add(flag);
    if (event.code === 'Space' && !event.repeat) pressed.add('confirm');
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  // Keys released while the tab is hidden never send keyup: drop everything.
  window.addEventListener('blur', () => down.clear());

  const has = (...codes) => codes.some((code) => down.has(code));

  return {
    /** Forward/back drive or walk axis: 1 forward, -1 back, 0 still. */
    forward() {
      return (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    },
    /** Steering / strafe axis: -1 left, 1 right. */
    strafe() {
      return (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    },
    running() {
      return has('ShiftLeft', 'ShiftRight');
    },
    braking() {
      return has('Space');
    },
    /** True once per physical press of the named one-shot action. */
    take(flag) {
      if (!pressed.has(flag)) return false;
      pressed.delete(flag);
      return true;
    },
    /** Any key at all held (used to wake the audio engine on first touch). */
    anyDown() {
      return down.size > 0 || pressed.size > 0;
    },
  };
}
