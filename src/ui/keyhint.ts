// Desktop key-hint chip, shared by the transport and start-wave controls
// (build-phase-controls design D4) — the palette's shortcut treatment: a
// small corner label on the button, absent on mobile. Host buttons must be
// positioned (`relative`) for the corner anchor to hold.

const KEY_HINT =
  'pointer-events-none absolute left-1 top-0.5 font-mono text-label-xs text-on-surface-variant/60 mobile:hidden';

export function keyHint(label: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = KEY_HINT;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = label;
  return el;
}
