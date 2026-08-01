// Dual Dijkstra flow fields
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Inbound field: multi-source from the treasury
//   - Returning field: multi-source from all active spawns at once
//   - 8-connected, integer costs 1024 orthogonal / 1448 diagonal
//   - Corner-cutting prevented at field-build time, not at move time
//   - Bucket queue keyed on cost — deterministic pop order, no tie-break rule needed

// TODO(P1): not implemented
export {};
