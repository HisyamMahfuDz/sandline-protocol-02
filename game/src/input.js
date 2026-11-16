// Input: pointer lock, held keys, mouse-look deltas, and edge-triggered presses.
// The simulation reads this state once per fixed step; takeLook drains the
// accumulated mouse movement so no look input is ever applied twice.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    pressed: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    firePressed: false,
    locked: false,
    menuOpen: false,
    jumpQueued: false,
  };

  function requestLock() {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  document.addEventListener('mousedown', (event) => {
    if (!state.locked || event.button !== 0) return;
    state.firing = true;
    state.firePressed = true;
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    state.keys.add(event.code);
    state.pressed.add(event.code);
    if (event.code === 'Space') state.jumpQueued = true;
  });

  document.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });

  document.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });

  window.addEventListener('blur', () => {
    state.keys.clear();
    state.firing = false;
  });

  return {
    state,
    requestLock,
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    // consumePressed: true once per physical press, then cleared.
    consumePressed(code) {
      if (!state.pressed.has(code)) return false;
      state.pressed.delete(code);
      return true;
    },
    endStep() {
      state.pressed.clear();
      state.jumpQueued = false;
      state.firePressed = false;
    },
  };
}
