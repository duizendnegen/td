## REMOVED Requirements

### Requirement: Flow-field overlay (F1)

**Reason**: Superseded by the player-facing `path-preview` lane ribbon. F1 drew every tile's field
direction as an arrow, which is complete but unreadable — it has no notion of "the route", so it
never answered the question it existed for. The ribbon answers it directly, and the ribbon's
orphaned-region shading is a better surface for walkable-but-unreachable tiles than F1's
per-tile diamonds, appearing exactly when a placement is about to cause one.

**Migration**: For "where do enemies go", arm a build tool and read the lane ribbon
(`path-preview`). For "which tiles are unreachable", hover the candidate placement that would
orphan them and read the shaded region. Corner-rule verification — the one duty the ribbon does
not carry, since a lane is a single route rather than an exhaustive sweep — is covered by the
`flowfield-pathfinding` corner-cutting requirement and its automated tests, which check the whole
board rather than one route. Blocked tiles are legible from the rendered structures themselves.

The following removed requirement text is retained for the record:

Pressing `F1` SHALL toggle an overlay showing, per tile: the field's direction as an arrow,
colour-coded inbound versus returning, blocked tiles, and unreachable tiles distinguished from
finite-cost tiles.

#### Scenario: Corner rule is visually verifiable

- **WHEN** `F1` is active on terrain containing corner-to-corner blocked pairs
- **THEN** no displayed arrow points diagonally between two blocked tiles
