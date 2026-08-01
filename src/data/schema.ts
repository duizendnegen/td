// Zod schemas for level and balance files
// See ARCHITECTURE.md §10
//
// Responsibilities:
//   - Shape validation plus semantic checks
//   - Every group.spawn references a declared spawn id
//   - Every group.type exists in balance.json
//   - Every spawn reaches the treasury on the starting terrain
//   - Float rates from JSON converted to integers once, here, at load

// TODO(P1): not implemented
export {};
