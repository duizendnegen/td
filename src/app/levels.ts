// The ordered level sequence and successor-URL resolution
// See the level-progression spec and the balance-ux-tweaks design D9
//
// Responsibilities:
//   - One static table: ?level= value → level JSON → successor's value
//   - Successor URL construction, carrying an explicit ?seed= through so a
//     shared repro link keeps its seed across the level hop

import level01Json from '../data/levels/level_01.json';
import level02Json from '../data/levels/level_02.json';

export interface LevelEntry {
  /** The ?level= value that selects this level. */
  param: string;
  json: unknown;
  /** The successor's ?level= value, or null on the final level. */
  next: string | null;
}

export const LEVEL_SEQUENCE: readonly LevelEntry[] = [
  { param: '1', json: level01Json, next: '2' },
  { param: '2', json: level02Json, next: null },
];

/** ?level=2 plays level_02; anything else (or nothing) plays level_01. */
export function levelForParam(param: string | null): LevelEntry {
  return LEVEL_SEQUENCE.find((l) => l.param === param) ?? LEVEL_SEQUENCE[0]!;
}

/**
 * The URL that starts a fresh run of the successor level (design D9), or
 * null when this level is the last. An explicit ?seed= in the current search
 * is carried through; everything else is dropped.
 */
export function nextLevelUrl(next: string | null, currentSearch: string, pathname: string): string | null {
  if (next === null) return null;
  const params = new URLSearchParams();
  params.set('level', next);
  const seed = new URLSearchParams(currentSearch).get('seed');
  if (seed !== null) params.set('seed', seed);
  return `${pathname}?${params.toString()}`;
}
