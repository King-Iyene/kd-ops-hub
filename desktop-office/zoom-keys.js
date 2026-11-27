// Which zoom key was pressed? (Ctrl or Cmd with plus, minus or zero; Shift may be held.)
//
// The menu shortcuts Ctrl+Plus and Ctrl+Minus only matched the exact keys they name: Ctrl+Shift+= makes a "+", so zooming IN with Shift
// held worked, but Ctrl+Shift+- makes an underscore ("_"), which matched nothing, so zooming OUT with Shift held did nothing (and plain
// Ctrl+= did not zoom in either). This reads the key itself (and the physical key as a fallback) so every common way to press
// them works, with or without Shift, on the main keyboard or the number pad. It is plain code with no Electron in it so it can be tested.

/** 'in', 'out' or 'reset' for a key press, or null when it is not a zoom key. `input` is Electron's before-input-event input. */
function zoomFromInput(input) {
  if (!input || input.type !== 'keyDown') return null;
  if (!(input.control || input.meta) || input.alt) return null;
  const key = String(input.key || '');
  const code = String(input.code || '');
  if (key === '+' || key === '=' || key === 'Add' || code === 'Equal' || code === 'NumpadAdd') return 'in';
  if (key === '-' || key === '_' || key === 'Subtract' || code === 'Minus' || code === 'NumpadSubtract') return 'out';
  if (key === '0' || code === 'Digit0' || code === 'Numpad0') return 'reset';
  return null;
}

/** The new zoom level (the app's steps are half a level, from -3 to +4; 0 is normal size). */
function nextZoomLevel(level, action) {
  if (action === 'reset') return 0;
  const step = action === 'in' ? 0.5 : -0.5;
  return Math.max(-3, Math.min(4, level + step));
}

module.exports = { zoomFromInput, nextZoomLevel };
