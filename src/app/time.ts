// Time controls — pause and hold-to-fast-forward
// See the time-controls change (design D1, D4, D5)
//
// Responsibilities:
//   - The rate at which the loop drives simulation ticks; NOT simulation state
//   - Two orthogonal controls: play/pause sets the resting rate, fast-forward
//     overrides it while held — including while paused, which is what makes a
//     paused game scrubbable
//
// The simulation never sees any of this. Pause is an absence, not a state: it
// means `advance()` is not called. Nothing here reaches the hash, and the
// replay goldens are indifferent to every value in this file.

/**
 * Fast-forward multiplier. THE value to retune during playtesting — 4× is
 * watchable (1.33 ticks per 60fps frame; interpolation starts stuttering around
 * 9×, and the loop's 5-tick catch-up clamp binds at ~15×), while a higher value
 * serves skipping a wave's tail better. Override without a rebuild via `?ff=`
 * or `__td.time.speed`.
 */
export const FF_SPEED = 10;

/** Resting rate while playing. Fixed: the player is offered no speed choice. */
const PLAY_RATE = 1;

/** Where a fast-forward hold came from; each releases independently. */
export type FfSource = 'key' | 'pointer';

export class TimeControl {
  private pausedFlag = false;
  /**
   * Held sources, not one flag. A global pointer-up release must not cancel a
   * keyboard hold just because the player clicked something, and vice versa.
   */
  private readonly ffSources = new Set<FfSource>();

  /** The fast-forward multiplier; mutable so a playtest can retune it live. */
  speed: number;

  constructor(speed: number = FF_SPEED) {
    this.speed = speed;
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  get ffHeld(): boolean {
    return this.ffSources.size > 0;
  }

  /**
   * Wall-clock multiplier for this frame.
   *
   *              │ FF not held │  FF held
   *    ──────────┼─────────────┼──────────
   *     playing  │     1×      │  speed
   *     paused   │     0×      │  speed
   *
   * Fast-forward overrides pause rather than being suppressed by it: holding it
   * while paused is the scrub, and releasing returns to frozen.
   */
  get rate(): number {
    if (this.ffHeld) return this.speed;
    return this.pausedFlag ? 0 : PLAY_RATE;
  }

  /** True when no time is passing — the renderer's cue to show committed state. */
  get frozen(): boolean {
    return this.rate === 0;
  }

  setPaused(paused: boolean): void {
    this.pausedFlag = paused;
  }

  togglePaused(): void {
    this.pausedFlag = !this.pausedFlag;
  }

  /**
   * Fast-forward is momentary. Every release path — key up, pointer up, pointer
   * leaving the control, the control unmounting mid-hold — funnels here, so the
   * game can never be stranded at speed.
   */
  setFastForward(held: boolean, source: FfSource): void {
    if (held) this.ffSources.add(source);
    else this.ffSources.delete(source);
  }

  /** Drop every hold at once — for losing the window or the tab being hidden. */
  releaseFastForward(): void {
    this.ffSources.clear();
  }
}
