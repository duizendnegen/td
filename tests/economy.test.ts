// See ARCHITECTURE.md §12
import { describe, it } from 'vitest';

describe('economy', () => {
  it.todo('interest accrues only during waves');
  it.todo('interest does not accrue on a negative balance');
  it.todo('bounties credit the treasury');
  it.todo('spending is blocked while balance < 0');
  it.todo('loss triggers at -100 gold');
});

// TODO(P4): implement
