## MODIFIED Requirements

### Requirement: Lanes are the routes from each active spawn and from the treasury

The ribbon SHALL draw one inbound lane per **currently active** spawn, following the inbound
routing to the treasury, plus one return lane per **currently active** spawn, following that
spawn's returning routing from the treasury back to that spawn. Each lane SHALL be the tile
sequence a follower of that routing would actually visit, so a lane never crosses a blocked tile
and never clips a blocked corner.

#### Scenario: One lane pair per active spawn

- **WHEN** the ribbon is shown on a level with two active spawns
- **THEN** four lanes are drawn: one from each spawn to the treasury, and one from the treasury
  back to each spawn

#### Scenario: Dormant spawns get no lane

- **WHEN** the ribbon is shown while a declared spawn has not yet reached its activation wave
- **THEN** no lane is drawn from or to that spawn, and its pair appears once it activates

#### Scenario: Every return lane ends at its own spawn

- **WHEN** two spawns are active and one is much cheaper to reach from the treasury
- **THEN** the farther spawn's return lane still runs to the farther spawn — no return lane
  drains to a nearer exit

#### Scenario: Lanes are legal routes

- **WHEN** any lane is drawn on terrain containing corner-to-corner blocked pairs
- **THEN** no segment of that lane passes through a blocked tile or diagonally between two blocked
  tiles
