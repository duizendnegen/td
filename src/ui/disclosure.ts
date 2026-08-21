// Disclosure — the expandable top-bar readout
// See ARCHITECTURE.md §9 and the wave-ledger build-ui delta ("Top-bar
// readouts expand into dropdown panels"), design D8
//
// Responsibilities:
//   - Owns THE open panel: at most one across every registered pair, so
//     opening one closes the other
//   - ARIA on each control: role, tabindex, aria-expanded, aria-controls
//   - Toggles on click and on Enter/Space while the control has focus;
//     closes on Escape — bound in the capture phase and acted on only while
//     something is open, so the palette's Escape (clear the tool) is
//     untouched otherwise and never fires alongside a close — and on a
//     capture-phase pointerdown outside the open control and panel, which
//     is never cancelled: the same press goes on to the board
//   - Never pauses the game, never reads sim state; the panels' content is
//     their owner's business (ledgerhud.ts)

export interface DisclosurePair {
  /** The readout that toggles the panel: the recessed slot itself. */
  control: HTMLElement;
  /** The dropdown, already in the DOM; shown and hidden by class swap here. */
  panel: HTMLElement;
  /** The panel's visible classes; `hidden` is appended while closed. */
  panelClass: string;
}

export class Disclosure {
  private current: DisclosurePair | null = null;
  private nextId = 0;

  constructor() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.current) return;
        // Close, and keep the key from the palette: Escape with a panel open
        // means "close the panel", not "and also drop the tool".
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      },
      true,
    );
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.current) return;
        const target = e.target instanceof Node ? e.target : null;
        if (target && (this.current.control.contains(target) || this.current.panel.contains(target))) return;
        // Outside: close — without preventDefault or stopPropagation, so a
        // press on a tile is still the press on that tile.
        this.close();
      },
      true,
    );
  }

  /** Wire one control/panel pair. The panel starts closed. */
  register(control: HTMLElement, panel: HTMLElement, panelClass: string): DisclosurePair {
    const pair: DisclosurePair = { control, panel, panelClass };
    if (!panel.id) panel.id = `disclosure-${this.nextId++}`;
    control.setAttribute('role', 'button');
    control.tabIndex = 0;
    control.setAttribute('aria-expanded', 'false');
    control.setAttribute('aria-controls', panel.id);
    // A style, not a class: the controls swap whole class strings per state.
    control.style.cursor = 'pointer';
    panel.className = `${panelClass} hidden`;
    panel.setAttribute('aria-hidden', 'true');
    // A button inside the control (the grid-upgrade control) keeps its own
    // meaning: its click and its Enter/Space never toggle the panel.
    const fromInnerButton = (e: Event): boolean =>
      e.target instanceof Element && e.target !== control && e.target.closest('button') !== null;
    control.addEventListener('click', (e) => {
      if (fromInnerButton(e)) return;
      this.toggle(pair);
    });
    control.addEventListener('keydown', (e) => {
      if (fromInnerButton(e)) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Space on a focused readout is the readout's, not the wave-start key's.
      e.preventDefault();
      e.stopPropagation();
      this.toggle(pair);
    });
    return pair;
  }

  /** Whether this pair's panel is the open one. */
  isOpen(pair: DisclosurePair): boolean {
    return this.current === pair;
  }

  toggle(pair: DisclosurePair): void {
    if (this.current === pair) this.close();
    else this.open(pair);
  }

  open(pair: DisclosurePair): void {
    if (this.current === pair) return;
    this.close();
    this.current = pair;
    pair.panel.className = pair.panelClass;
    pair.panel.setAttribute('aria-hidden', 'false');
    pair.control.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    const pair = this.current;
    if (!pair) return;
    this.current = null;
    pair.panel.className = `${pair.panelClass} hidden`;
    pair.panel.setAttribute('aria-hidden', 'true');
    pair.control.setAttribute('aria-expanded', 'false');
  }
}
