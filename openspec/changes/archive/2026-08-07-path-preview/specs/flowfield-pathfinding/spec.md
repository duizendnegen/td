## ADDED Requirements

### Requirement: A field is traceable into an ordered tile sequence

Given a flow field and a start tile, the system SHALL produce the ordered sequence of tiles a
follower of that field would visit from the start tile. The trace SHALL terminate at the field's
source, SHALL terminate immediately at an unreachable tile, and SHALL terminate for any field and
any start tile without unbounded iteration.

#### Scenario: Trace from a spawn arrives at the treasury

- **WHEN** the inbound field is traced from a spawn tile that can reach the treasury
- **THEN** the sequence starts at that spawn, ends at the treasury, and each consecutive pair
  matches that tile's field direction

#### Scenario: Trace from an unreachable tile yields no route

- **WHEN** a field is traced from a walkable tile the field marks unreachable
- **THEN** the sequence contains no route onward from that tile

#### Scenario: Trace from a source is empty of steps

- **WHEN** a field is traced from one of its own source tiles
- **THEN** the sequence is that tile alone

#### Scenario: Tracing always terminates

- **WHEN** a field is traced from every tile of a board
- **THEN** every trace terminates

### Requirement: Speculative routes are obtainable without aliasing live field state

The routing that would result from a candidate placement SHALL be obtainable together with that
placement's validation verdict, as data whose validity does not depend on subsequent simulation
activity. A caller holding previously obtained speculative routing SHALL NOT observe it change
when another placement is evaluated or when a placement is confirmed.

#### Scenario: A later evaluation does not rewrite an earlier result

- **WHEN** speculative routing is obtained for one candidate tile and then obtained for a different
  candidate tile
- **THEN** the first result still describes the first tile's placement

#### Scenario: Confirming a placement does not rewrite a held result

- **WHEN** speculative routing is obtained for a candidate tile and that placement is then
  confirmed
- **THEN** the previously obtained result is unchanged by the confirmation
