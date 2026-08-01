// Placement validation and removal timers
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Bounds, occupancy, and no-enemy-in-footprint checks
//   - Reachability: every active spawn AND every live enemy
//   - Revert-on-reject by swapping a spare field buffer
//   - Removal delay 80 ticks; the tile stays blocked throughout

// TODO(P1): not implemented
export {};
