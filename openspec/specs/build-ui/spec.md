# build-ui

## Purpose

The player's hands and eyes for the maze loop: a treasury readout, a build palette, a truthful
ghost preview backed by the real validation, and honest reject feedback — so every placement
decision is informed and every refusal is legible.

## Requirements

### Requirement: HUD shows the live treasury balance

The HUD SHALL display the current treasury balance, updating as simulation state changes so that
grabs, charges, bounties, and refunds are visible when they happen.

#### Scenario: A grab is visible

- **WHEN** an enemy grabs gold at the treasury
- **THEN** the displayed balance drops by the grabbed amount on the next rendered frame

### Requirement: Build palette with affordability and debt-warning states

The palette SHALL offer the wall, the solar panel, and all four tower archetypes with their
level-1 costs, and SHALL show the rated power of every tower item and the output of the panel.
An item whose cost would leave the balance ≥ 0 SHALL read as affordable; an item whose purchase
would drive the balance negative SHALL read as a distinct debt warning while remaining
selectable; while the balance is below 0 every item SHALL read as blocked. Lack of power SHALL
NOT block or warn on any item — the meter carries that information.

#### Scenario: Debt purchase is warned, not hidden

- **WHEN** the balance is 50 and a palette item costs 100
- **THEN** the item shows a warning state and can still be selected and placed

#### Scenario: Negative balance blocks the palette

- **WHEN** the balance is below 0
- **THEN** every palette item reads as blocked and clicks place nothing

#### Scenario: All archetypes are placeable

- **WHEN** the player selects each of the four tower palette items in turn
- **THEN** each drives the ghost preview and places its archetype via the same command path

#### Scenario: The panel is placeable and removable like a wall

- **WHEN** the player selects the panel item
- **THEN** it drives the ghost preview with wall-style validation tinting and places a panel via
  the same command path, the card shows the panel's cost and output, and a placed panel is
  removed with the remove tool under the wall's rules (it is not inspectable)

### Requirement: Pointer input maps to tile commands

A pointer position over the board SHALL resolve via ground raycast to a tile, and confirmed build
or removal clicks SHALL enter the simulation only as commands — the UI SHALL never mutate
simulation state directly.

#### Scenario: Click becomes a command

- **WHEN** the player clicks a tile with a palette item selected
- **THEN** a placement command for that tile is queued and applies at the next tick boundary

### Requirement: Ghost preview is driven by the authoritative validation

While a palette item is selected, a footprint ghost SHALL be shown — following the hovered tile
on pointer-hover devices, or anchored to the last tapped tile as a pending placement on touch —
tinted by the verdict of the same validation logic the simulation uses to accept placements,
evaluated speculatively. The verdict SHALL be re-evaluated when the ghost's tile changes or a
new tick's state arrives, regardless of how the ghost is positioned. Speculative evaluation
SHALL NOT change simulation state: hovering or holding a pending ghost never changes the state
hash.

#### Scenario: Preview agrees with validation

- **WHEN** the ghost occupies a footprint that the simulation would reject for any validation reason
- **THEN** the ghost is tinted invalid

#### Scenario: Enemy movement flips the verdict without input

- **WHEN** an enemy walks into the ghost's footprint while the pointer or pending ghost is stationary
- **THEN** the ghost flips to invalid on that tick without any input event

#### Scenario: Hovering is free of side effects

- **WHEN** the player hovers many candidate footprints without clicking while a replay of the same
  seed and commands runs without hovering
- **THEN** both runs produce identical state hashes

#### Scenario: A pending touch ghost is free of side effects

- **WHEN** a pending ghost sits on a tile across many ticks without being confirmed
- **THEN** the simulation state hash is identical to a run without the pending ghost

### Requirement: Every invalid click gets the same reject feedback

A placement click that does not result in a confirmed placement — whether the ghost already showed
invalid, or the ghost showed valid and the authoritative validation rejected at the applying tick —
SHALL produce identical reject feedback: a brief red flash on the attempted footprint, no treasury
charge, no state change, and no queued retry.

#### Scenario: Stale green loses the race

- **WHEN** the ghost shows valid, the player clicks, and an enemy enters the footprint before the
  command's applying tick
- **THEN** the placement is rejected, the footprint flashes red, the treasury is unchanged, and no
  wall appears then or later

#### Scenario: Red click feels the same

- **WHEN** the player clicks while the ghost shows invalid
- **THEN** the same red-flash feedback plays and no command takes effect

### Requirement: Range ring on tower ghost and selection

The tower ghost and any selected placed tower SHALL display a range ring whose radius matches the
simulation's range for that tower.

#### Scenario: Ring matches simulation range

- **WHEN** an enemy stands exactly at the edge of the displayed ring
- **THEN** the tower's in-range check for that enemy agrees with what the ring shows

### Requirement: Provisional structures read as uncommitted on the board

Structures that are still provisional SHALL be visually distinguishable from committed ones on the
board, so a player can see what will lock in when the wave starts without inspecting each one. The
distinction SHALL clear the moment they commit.

#### Scenario: This phase's work is distinguishable

- **WHEN** the player has built during the build phase alongside structures from earlier phases
- **THEN** the newly built structures read as uncommitted and the earlier ones do not

#### Scenario: Starting a wave clears the distinction

- **WHEN** the wave starts and time advances
- **THEN** every structure reads as committed

### Requirement: Remove controls are unavailable during a wave

Every control that issues a removal — the palette's remove tool, the desktop inspector's remove
action, and the mobile inspector sheet's remove action — SHALL read as unavailable while a wave is
running **for committed structures**, and SHALL become available again for them when the wave
settles. The two inspector controls SHALL additionally name the wave as the reason; the palette tool
SHALL read as unavailable in the same visual language as any other blocked palette item, without
reason text — so the explanation lives where it fits on both form factors rather than in a
desktop-only affordance. While unavailable, activating any of them SHALL issue no command.

Because provisional structures remain removable during a wave, the palette's remove tool SHALL stay
usable while a wave runs and SHALL reject only what is committed, with the ordinary reject feedback.
A remove tool selected when a wave starts SHALL therefore no longer be deselected.

#### Scenario: Starting a wave blocks selling committed structures

- **WHEN** a wave starts and the player targets a structure that has lived through a wave tick
- **THEN** both inspector remove actions read unavailable with the wave named as the reason, and
  clicking that structure with the remove tool issues no removal command and gives the ordinary
  reject feedback

#### Scenario: The remove tool survives the start of a wave

- **WHEN** a wave starts while the remove tool is selected
- **THEN** the tool stays selected, so a player mid-revision is not interrupted

#### Scenario: Settlement re-enables selling

- **WHEN** the wave settles and the build phase resumes
- **THEN** the remove controls read available again for every structure and a click issues a
  removal command

### Requirement: Tower inspector with upgrade action

Selecting a placed tower SHALL show an inspector with the tower's archetype, current level,
current stats including its rated power, its remove control showing the refund it would return,
and — below level 3 — the next level's cost, its rated power, and an upgrade action that issues
the upgrade command. The upgrade action SHALL reflect the same affordability and debt-warning
states as the palette and SHALL read as blocked while the balance is below 0. At level 3 the
inspector SHALL show a maxed state with no upgrade action.

The refund shown SHALL be the amount that removal would actually credit — the full invested total
for a provisional tower, the removal refund fraction of it for a committed one — and a provisional
tower's remove control SHALL name the full refund as the revision window it is, so it reads as
undoing a decision rather than as a better price.

The remove control SHALL read as unavailable while a wave is running **only** for committed towers;
a provisional tower's remove control SHALL remain available during a wave.

#### Scenario: Inspector upgrades through the command path

- **WHEN** the player clicks the inspector's upgrade action on a level-1 tower with balance ≥ 0
- **THEN** an upgrade command is queued and the inspector reflects level 2 once it applies

#### Scenario: Maxed towers offer no upgrade

- **WHEN** a level-3 tower is selected
- **THEN** the inspector shows its stats and a maxed state, with no upgrade cost or action

#### Scenario: Removing through the inspector is immediate

- **WHEN** the player clicks the inspector's remove control during the build phase
- **THEN** a removal command is queued, and once it applies the structure is gone, the refund is
  visible in the treasury readout, and the inspector closes

#### Scenario: The refund shown matches what is paid

- **WHEN** a provisional tower and a committed tower of the same total invested cost are inspected
- **THEN** the provisional one shows the full invested total and the committed one shows the
  refund fraction of it, and removing each credits exactly the amount shown

#### Scenario: A provisional tower can be unwound during a wave

- **WHEN** a tower is placed during a wave while time is not advancing and is then selected
- **THEN** its remove control reads available, and activating it issues a removal command

#### Scenario: Rated power is shown now and next

- **WHEN** a level-1 tower is selected
- **THEN** the inspector shows its current rated power among its stats and the level-2 rated
  power beside the upgrade cost

### Requirement: Upgrade preview shows the next level's range

While the inspector's upgrade action is hovered on a tower whose archetype scales range, the
selected tower's range ring SHALL additionally preview the next level's radius, so range
purchases are informed like placements.

#### Scenario: Next ring on hover

- **WHEN** the player hovers the upgrade action of a level-1 sniper
- **THEN** the level-2 range ring is shown alongside the current ring, and disappears when the
  hover ends

### Requirement: Enemy status icons

An enemy carrying gold SHALL display a carried-gold indicator, and an enemy whose slow is
unexpired SHALL display a slowed indicator, both readable from the isometric camera and both
purely render-side.

#### Scenario: Slowed state is visible

- **WHEN** a slow tower slows an enemy
- **THEN** a slowed icon appears above the enemy and disappears when the slow expires

### Requirement: Wave counter and preview

The HUD SHALL show the current wave number and total wave count, and — during the build phase —
a preview of the upcoming wave's composition: enemy types, counts, and which spawns they come
from, including a clear signal when a new spawn activates with that wave.

#### Scenario: Preview warns of the second front

- **WHEN** the player is in the build phase before a wave that activates a second spawn
- **THEN** the preview shows that wave's groups and marks the newly activating spawn

### Requirement: Start-wave control with solvency lock

The UI SHALL provide a start-wave control that is enabled only in the build phase while the
treasury is solvent. While wave-locked by debt, the control SHALL show a locked state that names
the reason and points at selling structures as the way out. During an active wave the control
SHALL be unavailable, and its slot SHALL host the transport controls instead.

On desktop the start-wave control SHALL additionally be activated by the same key that toggles
pause during a wave, with the key's meaning selected by run phase. The key SHALL respect the same
solvency lock as the button, SHALL start exactly one wave per press regardless of keyboard
auto-repeat, and the control SHALL carry its key hint in the same treatment the transport
controls use.

The key SHALL be inert for a short arming delay (about one second of wall clock) after a wave
settles into the build phase, so a pause press aimed at the tail of a settling wave cannot start
the next one. The delay SHALL apply only to the key — the button stays immediate — and SHALL NOT
apply to the run's first build phase.

#### Scenario: Debt locks the button with guidance

- **WHEN** settlement leaves the treasury in debt
- **THEN** the start-wave control is disabled, shows the debt, and directs the player to sell
  structures to recover

#### Scenario: A refund unlocks the button in its own tick

- **WHEN** the player is wave-locked by debt and removes a structure whose refund restores solvency
- **THEN** the start-wave control reads enabled on the next rendered frame, with no countdown in
  between

#### Scenario: Starting a wave from a paused build phase

- **WHEN** the player attempts to pause during the build phase and then activates the start-wave
  control
- **THEN** pause never engaged, and the wave begins with time running with the transport controls
  taking the slot

#### Scenario: The key starts the wave

- **WHEN** the player presses the start-wave key during a solvent build phase with waves remaining
- **THEN** the wave begins with time running, and the transport controls take the slot

#### Scenario: The key respects the solvency lock

- **WHEN** the player presses the start-wave key while wave-locked by debt
- **THEN** no wave starts and the locked control with its guidance remains

#### Scenario: A settling wave does not eat a mistimed pause press

- **WHEN** the player presses the pause key just after a wave settles into the build phase,
  within the arming delay
- **THEN** no wave starts, and a press after the delay starts the next wave

#### Scenario: A held key starts exactly one wave

- **WHEN** the player holds the start-wave key long enough for keyboard auto-repeat to engage
- **THEN** exactly one wave starts, and the game is not paused when the auto-repeat continues into
  the running wave

### Requirement: Transport controls occupy the start-wave slot during a wave

The UI SHALL present play/pause and fast-forward as transport controls in the same bottom-slot
footprint the start-wave control occupies, shown while a wave is running — the phase in which the
start-wave control is already hidden. They SHALL use the conventional transport iconography (play,
pause, fast-forward) and SHALL NOT display or offer a choice of speed multiplier.

Switching between the start-wave control and the transport controls SHALL NOT shift the surrounding
layout.

#### Scenario: The slot swaps with the phase

- **WHEN** a wave starts
- **THEN** the start-wave control is replaced in place by the transport controls, and when the wave
  settles the start-wave control returns

#### Scenario: Play/pause reflects the current state

- **WHEN** the game is paused
- **THEN** the control reads as a play action, and while running it reads as a pause action

#### Scenario: No speed choice is exposed

- **WHEN** the transport controls are visible
- **THEN** no multiplier value or speed selector is presented to the player

### Requirement: Time controls are keyboard-operable on desktop

The UI SHALL bind play/pause and fast-forward to keys, with fast-forward held for as long as the
key is down, matching the palette's existing desktop keyboard-shortcut treatment including its key
hints. The fast-forward binding SHALL remain active in every run phase, including phases in which
the transport buttons are not mounted. The play/pause binding SHALL operate only while a wave is
running; in the build phase its key activates the start-wave control instead, and in the remaining
phases it does nothing.

Key handling SHALL prevent the browser's default activation of a focused control in every phase,
so that a bound key pressed after clicking a button does not both re-activate the button and run
the binding.

#### Scenario: Keys work where the buttons are not shown

- **WHEN** the player holds the fast-forward key during the build phase with debug-spawned enemies
  on the board
- **THEN** time fast-forwards as it does during a wave, without transport buttons being present —
  while the pause key engages no pause there

#### Scenario: Key hints match the palette

- **WHEN** the transport controls are shown on a desktop layout
- **THEN** each carries its key hint in the same treatment the palette items use, and the hints are
  absent on the mobile layout

#### Scenario: Pressing the key after clicking the button toggles once

- **WHEN** the player clicks play/pause and then presses the play/pause key
- **THEN** the state toggles exactly once

#### Scenario: Held keys do not repeat

- **WHEN** the player holds the fast-forward key long enough for keyboard auto-repeat to engage
- **THEN** fast-forward engages once and stays engaged until the key is released

### Requirement: Win and lose screens with the run summary

On run end the UI SHALL present a win or lose screen showing the run summary: gold stolen, gold
escaped, kills, and final balance.

#### Scenario: Victory shows the ledger

- **WHEN** the run ends as won
- **THEN** the win screen displays stolen, escaped, kills, and final balance from the summary

### Requirement: Concede control that flags impossible recovery

A concede control SHALL be available throughout the run. When the balance is negative and the
total refund value of all remaining structures — each at the refund it would actually pay — cannot
reach 0, the UI SHALL state plainly that recovery is impossible, so a newcomer is never left poking
at a dead run.

#### Scenario: Dead run says so

- **WHEN** the debt exceeds the combined refund value of everything still standing
- **THEN** the concede control (or an adjacent notice) states that recovery is impossible

#### Scenario: Provisional value keeps a run alive

- **WHEN** the debt exceeds what committed structures could raise at the refund fraction, but
  provisional structures' full refunds would cover it
- **THEN** the notice is not shown

### Requirement: HUD layout adapts to form factor

The HUD SHALL present two layouts. On desktop-sized viewports: a top app bar containing the
treasury readout, the build palette as a left rail, and the tower inspector as a right panel.
Below the mobile breakpoint: a compact top bar with the treasury readout, the build palette as
a bottom menu, and the start-wave control prominently accessible. Both layouts SHALL expose the
same controls and states — no capability is desktop-only or mobile-only.

#### Scenario: Desktop layout

- **WHEN** the game runs in a desktop-sized viewport
- **THEN** the treasury readout is in a top bar, the build palette is a left rail, and selecting
  a tower opens the inspector as a right-side panel

#### Scenario: Mobile layout

- **WHEN** the game runs in a viewport below the mobile breakpoint
- **THEN** the treasury readout is in a compact top bar and the build palette is a bottom menu
  offering the same items and states as the desktop rail

### Requirement: Mobile inspector is a bottom sheet that swaps with the build menu

Below the mobile breakpoint, selecting a placed tower SHALL replace the bottom build menu with
an inspector bottom sheet showing the tower's archetype, level, condensed stats, and
touch-sized upgrade and remove actions with the same affordability, debt-warning, blocked,
wave-unavailable, and maxed states as the desktop inspector. Dismissing the sheet or deselecting the
tower SHALL restore the build menu. The sheet SHALL remain a compact bottom band: stats are
condensed to keep it within roughly the bottom third of the viewport, and it SHALL NOT expand
into a full-screen view that hides the board.

#### Scenario: Selection swaps the bottom zone

- **WHEN** the player taps a placed tower on a mobile-sized viewport
- **THEN** the build menu is replaced by the inspector sheet for that tower, and dismissing it
  brings the build menu back

#### Scenario: Sheet actions match desktop semantics

- **WHEN** the balance is below 0 and the inspector sheet is open
- **THEN** the sheet's upgrade action reads as blocked, exactly as the desktop inspector would

#### Scenario: Sheet remove action follows the wave gate

- **WHEN** the inspector sheet is open while a wave is running
- **THEN** its remove action reads unavailable, exactly as the desktop inspector's would

### Requirement: Wave progress bar

During an active wave the HUD SHALL display a segmented progress bar that fills as the wave
drains: progress SHALL be the fraction of the wave's total spawned-or-pending enemies that are
resolved (dead or escaped). The bar SHALL be empty at wave start, full at wave end, and hidden
outside active waves.

#### Scenario: Kills advance the bar

- **WHEN** a wave of 10 enemies has 4 dead and 1 escaped
- **THEN** the progress bar reads half full

#### Scenario: Hidden between waves

- **WHEN** the game is in the build phase
- **THEN** no wave progress bar is shown

### Requirement: The palette offers a move tool gated to the build phase

The palette SHALL offer a move tool as an armed mode alongside the remove tool, with the same
selection, deselection, and keyboard-shortcut treatment as other palette items. The move tool
SHALL read as unavailable outside the build phase — while a wave is running and in the
settled-locked state — in the same visual language as any other blocked palette item, without
reason text. While unavailable, activating it or pressing on structures with it armed SHALL
issue no command. A move tool armed when a wave starts SHALL read unavailable for the duration
and usable again when the build phase resumes.

Arming the move tool SHALL NOT by itself change simulation state or issue any command.

#### Scenario: The move tool arms like any other mode

- **WHEN** the player selects the move tool during the build phase
- **THEN** it reads as the armed tool, and any previously armed tool or selection is released

#### Scenario: A wave blocks the move tool

- **WHEN** a wave is running
- **THEN** the move tool reads as unavailable, and activating it or pressing on a structure with
  it armed issues no command

### Requirement: The armed move tool lifts, carries, and drops structures

With the move tool armed during the build phase, on pointer-hover devices, pressing on a tile that
holds structures SHALL lift that tile's stack — on dirt the wall together with any tower on it, on
a socket the tower. A move ghost SHALL follow the hovered tile: the tower's ghost with its range
ring when the stack holds a tower, otherwise the wall's ghost; tinted by the verdict of the same
validation the simulation uses to accept moves — evaluated speculatively with the origin freed for
a bare-dirt destination, and as a tower transfer for a foundation destination. Every structure in
the lifted stack SHALL read as lifted at its origin for the duration.

Dropping SHALL work both ways: releasing after a drag past a small slop attempts the move at the
release tile, and a sub-slop press-and-release (a click) keeps the stack lifted following the
hover until a second click attempts the move at that tile. A confirmed drop SHALL issue exactly
one move command. Deselecting the tool or pressing Esc SHALL cancel the lift with no command,
leaving every structure where it was. Pressing on an empty tile with the move tool armed and
nothing lifted SHALL do nothing.

The lifted stack's own tile SHALL read as a legal drop: the move ghost is tinted valid there, and
dropping on it — by drag release or by the second click — SHALL put the stack down where it
stands: the lift ends, no command is issued, no reject feedback plays, and the structures read as
standing at their origin. Putting a stack down this way is a cancel, not a move.

Speculative evaluation while carrying SHALL NOT change simulation state.

#### Scenario: Drag and drop moves the tower

- **WHEN** the player presses on a tile holding a wall and a tower with the move tool armed,
  drags past the slop, and releases over a bare dirt tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and once it applies both the wall
  and the tower stand there

#### Scenario: Dropping on a bare wall moves only the tower

- **WHEN** the player lifts a wall-and-tower stack and drops it on a bare wall whose ghost shows
  valid
- **THEN** exactly one move command is queued, and once it applies the tower stands on the
  destination wall while the origin wall still stands

#### Scenario: A wall lifts and drops like a tower

- **WHEN** the player presses on a bare wall with the move tool armed, drags past the slop, and
  releases over a dirt tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and the ghost that followed the drag
  was a wall ghost with no range ring

#### Scenario: Click to lift, click to drop

- **WHEN** the player clicks a mounted tower's tile with the move tool armed, moves the pointer,
  and clicks a tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and the tower ghost followed the
  hover between the two clicks

#### Scenario: Dropping back on the origin puts the structure down

- **WHEN** the player lifts a stack and drops it on its own tile — by releasing a drag over it or
  by a second click on it — while the ghost there reads valid
- **THEN** no command is issued, no reject feedback plays, the lift ends, and the structures read
  as standing at their origin with an unchanged simulation state hash

#### Scenario: Cancelling leaves no trace

- **WHEN** the player lifts a stack and then presses Esc or deselects the move tool
- **THEN** no command is issued, every structure reads as standing at its origin, and the
  simulation state hash is unchanged

#### Scenario: Carrying is free of side effects

- **WHEN** the player carries a lifted stack across many candidate tiles without dropping, while
  a replay of the same seed and commands runs without lifting anything
- **THEN** both runs produce identical state hashes

### Requirement: The inspector offers a move action

The tower inspector — the desktop panel and the mobile bottom sheet alike — SHALL offer a move
action alongside its upgrade and remove actions. Activating it SHALL arm the move tool and lift
the inspected tower in one step, leaving the interaction exactly where selecting the move tool
and then pressing on that tower would leave it: the tool reads armed, the inspector closes, the
tower reads lifted at its origin, and no command has been issued. From there the carry, drop,
put-down, cancel, and reject behaviour of the armed move tool applies unchanged — on pointer
devices the tower is carried until the next click drops it; on touch the pending move ghost with
its confirm and cancel affordances anchors at the tower's tile.

The action arms the tool for this one move only: when the lift it began ends — the move applies,
or the tower is put down on its origin, or a cancel affordance dismisses it — the move tool SHALL
be deselected, returning to the no-tool state, so the action reads as something done to this tower
rather than a switch into a mode. A failed drop is not the end of the lift: the tower stays lifted
and the tool stays armed until a later drop lands or the lift is cancelled, as for any lift. A move
tool the player armed from the palette is unaffected — it stays armed after a drop or put-down as
before.

The move action SHALL read as unavailable whenever the move tool is — outside the build phase —
and, like the inspector's remove control, SHALL name the wave as the reason while one runs. While
unavailable, activating it SHALL neither arm the tool, nor lift, nor issue any command.

#### Scenario: The inspector's move action lifts the tower

- **WHEN** the player inspects a tower during the build phase and activates the inspector's move
  action
- **THEN** the move tool reads armed, the inspector closes, the tower reads lifted at its origin
  with no command issued, and the next click on a tile whose ghost shows valid queues exactly one
  move command for that tile

#### Scenario: The inspector's move is one-shot

- **WHEN** the player lifts a tower through the inspector's move action, drops it on a valid tile,
  and the move applies
- **THEN** the tower stands on its new tile and no tool reads armed — the next click on a
  structure inspects it rather than lifting it

#### Scenario: The move action's lift ends like any other, and disarms

- **WHEN** the player lifts a tower through the inspector's move action and then clicks the
  tower's own tile, presses Esc, or deselects the tool
- **THEN** no command is issued, the tower reads as standing at its origin, the simulation state
  hash is unchanged, and no tool reads armed

#### Scenario: A failed drop after the inspector lift keeps the tool

- **WHEN** the player lifts a tower through the inspector's move action and drops it on a tile
  whose ghost shows invalid
- **THEN** the standard reject feedback plays, the tower stays lifted, and the move tool stays
  armed until a later drop lands or the lift is cancelled

#### Scenario: A palette-armed move tool is still a mode

- **WHEN** the player arms the move tool from the palette, lifts a tower, and drops it or puts
  it down on its origin
- **THEN** the move tool stays armed

#### Scenario: A wave locks the inspector's move action

- **WHEN** a wave is running and a tower is inspected
- **THEN** its move action reads unavailable naming the wave, and activating it arms no tool,
  lifts nothing, and issues no command

### Requirement: Every failed drop gets the same reject feedback

A drop that does not result in a confirmed move — whether the ghost already showed invalid, or
the ghost showed valid and the authoritative validation rejected at the applying tick — SHALL
produce the same reject feedback placements use: a brief red flash on the attempted tile, no
state change, no queued retry, and the structure still standing at its origin. After a failed
drop the structure SHALL remain lifted, so the player can try another tile without re-lifting. A
drop on the structure's own tile is a put-down, not a failed drop, and SHALL NOT flash.

#### Scenario: Dropping on an invalid tile flashes and keeps carrying

- **WHEN** the player drops a lifted tower on a tile whose ghost shows invalid
- **THEN** the red-flash feedback plays on that tile, no command takes effect, and the ghost
  still follows the pointer

#### Scenario: Stale green loses the race

- **WHEN** the ghost shows valid at the drop, and an enemy enters the destination before the
  command's applying tick
- **THEN** the move is rejected, the destination flashes red, and the tower still stands at its
  origin

### Requirement: Enemy health bar

An enemy that has taken any damage SHALL display a health bar above its model, purely
render-side and readable from the isometric camera. The bar SHALL be a full-width red track with a
green segment anchored at its left edge whose width is the enemy's remaining hp as a fraction of
its type's hp stat, so the red portion is revealed from the right as hp is lost. An enemy at full
hp SHALL show no bar. The bar SHALL be sized in proportion to the enemy's render scale — a larger
model carries a wider bar — SHALL follow the model, including its hover motion, SHALL face the
camera, and SHALL be drawn over any world geometry that would otherwise occlude it. The bar SHALL
be removed together with the enemy, whether it dies or leaks. Displaying the bar SHALL NOT change
simulation state or the state hash.

#### Scenario: A hit reveals the bar

- **WHEN** an enemy at full hp is hit for a quarter of its type's hp
- **THEN** a health bar appears above it, three-quarters green from the left with the remaining
  quarter red on the right

#### Scenario: Full hp shows nothing

- **WHEN** an enemy has not been damaged
- **THEN** it displays no health bar

#### Scenario: The bar shrinks with further damage

- **WHEN** a damaged enemy is hit again
- **THEN** its green segment shortens to the new remaining fraction and the red portion grows
  from the right, with the bar staying at the same width and position relative to the model

#### Scenario: The bar reads through a maze wall

- **WHEN** a damaged enemy flies through a wall canyon that would occlude it from the camera
- **THEN** its health bar remains visible

#### Scenario: Larger models carry wider bars

- **WHEN** a damaged tank and a damaged swarm enemy are side by side
- **THEN** the tank's bar is visibly wider than the swarm enemy's

#### Scenario: Death removes the bar

- **WHEN** a damaged enemy is killed or leaves the board
- **THEN** no bar remains where it was

### Requirement: The tower ghost reads the foundation rule and lays the wall

With a tower tool armed, the ghost over a tile holding a bare wall SHALL read as a legal
placement — tinted valid or debt by the same authoritative validation as any placement, with the
archetype's range ring — and a click there SHALL issue one tower placement. The ghost over a wall
that already carries a tower SHALL read invalid.

Every build ghost that reads as a legal placement SHALL carry the price of each structure it
previews as a badge on that structure's box: a tower ghost its tower's cost at the box's
mid-height, a wall ghost its wall's cost low on the box. An invalid ghost SHALL carry no price.

Over a dirt tile with no wall, the tool SHALL place the wall and the tower together: a click
SHALL issue exactly one tower placement that lays its wall, and the ghost SHALL preview it as two
structures — the full tower ghost with the wall ghost drawn inside its base, each with its own
price badge, tinted by the verdict of the wall placement it contains and by the sum of both costs
against the balance. Every ghost SHALL stand on the ground plane; no ghost is raised to indicate
what lies beneath it.

The palette's tower items and the desktop hint line SHALL state that towers stand on walls.

Selecting a stacked tile with no tool armed SHALL inspect the tower; the inspector's remove
control on a mounted tower SHALL remove the tower alone, leaving the wall standing.

#### Scenario: A wall invites the tower

- **WHEN** the player hovers a bare wall with a tower tool armed and balance ≥ the tower's cost
- **THEN** the ghost reads valid, shows the level-1 range ring centred on that tile and one price
  badge — the tower's — and a click issues one tower placement without a wall

#### Scenario: Bare dirt previews and places two

- **WHEN** the player hovers a dirt tile with no wall on it with a tower tool armed, where a wall
  would be a legal placement, and clicks
- **THEN** the ghost showed the tower ghost with the wall ghost inside it and two price badges —
  the tower's on the tower box, the wall's on the wall box — exactly one placement command is
  issued, and once it applies the tile holds a wall and the tower on it

#### Scenario: Bare dirt the wall rules refuse

- **WHEN** the player hovers a dirt tile with no wall where a wall would seal a spawn, with a
  tower tool armed
- **THEN** the ghost with its wall reads invalid with no price badges, the ribbon shows the
  orphaned region as for a wall,
  and clicking there gives the ordinary reject feedback with no command issued

#### Scenario: Both costs tint the ghost

- **WHEN** the player hovers bare dirt with a tower tool armed and the balance covers the tower's
  cost but not the wall's and the tower's together
- **THEN** the ghost reads as the debt tint

#### Scenario: The rule is named in the interface

- **WHEN** the player views the palette or the desktop hint line
- **THEN** the tower items and the hint line state that towers are built on walls

#### Scenario: Inspecting and removing a mounted tower

- **WHEN** the player selects a tile holding a wall and a tower, then activates the inspector's
  remove control during the build phase
- **THEN** the inspector showed the tower, one removal command is issued, and once it applies the
  tower is gone while the wall stands

### Requirement: Power meter beside the treasury readout

The HUD SHALL show one power meter next to the treasury readout: during a wave, the live draw
against the current connection capacity, the split between solar and grid supply, and the grid
cost per second; between waves, the rated total of standing towers against capacity, so the
player can see how close a peak would come to the ceiling before starting the wave. The meter
SHALL read as a warning while coverage is below 1 and SHALL show the connection tier. On mobile
the meter compacts into the top bar with the treasury.

#### Scenario: A brownout is signalled at the moment it happens

- **WHEN** engaged draw exceeds what can be supplied on a tick
- **THEN** on the next rendered frame the meter reads as a warning and shows the coverage

#### Scenario: Planning read between waves

- **WHEN** the run sits in the build phase
- **THEN** the meter shows the towers' rated total against capacity and the current tier, and
  the grid cost reads zero

### Requirement: Connection upgrade control

The meter SHALL offer a control that issues the connection-upgrade command, showing the next
tier's capacity and cost, reflecting the same affordability and debt-warning states as the
palette, reading as blocked while the balance is below 0, and reading as maxed with no action at
the last tier. The control SHALL state that the upgrade is final — there is no refund.

#### Scenario: Upgrade through the control

- **WHEN** the player activates the control with balance ≥ 0 and a next tier available
- **THEN** a connection-upgrade command is queued and the meter reflects the new tier and
  capacity once it applies

#### Scenario: Maxed connection

- **WHEN** the connection is at the level's last tier
- **THEN** the control shows a maxed state with no action

### Requirement: Brownout is visible on the board

While coverage is below 1, every tower SHALL read as dimmed on the board, in a state distinct
from normal operation and from the provisional marking, driven by the simulation's coverage,
and SHALL return to normal the frame coverage is back at 1.

#### Scenario: Towers dim together

- **WHEN** coverage drops below 1
- **THEN** every standing tower reads dimmed on the next rendered frame, and none is dimmed
  once coverage returns to 1

### Requirement: Top-bar readouts expand into dropdown panels

The treasury readout and the power meter SHALL each act as a disclosure control for a panel
that drops down below it: a click, a tap, or Enter/Space while focused toggles the panel;
opening one closes the other; Escape, a pointer-down outside the panel and its control, or
toggling the control again closes it. The control SHALL expose its expanded state to assistive
technology. An open panel SHALL keep refreshing from live state and SHALL NOT pause the
simulation, capture keyboard shortcuts beyond Escape, or intercept input to the board outside
its own bounds. On desktop the panel is anchored under its control in the top bar; below the
mobile breakpoint it spans the width of the compact top bar. Both form factors SHALL offer the
same panels with the same content.

#### Scenario: Opening one closes the other

- **WHEN** the gold ledger is open and the player clicks the power meter
- **THEN** the energy balance opens and the gold ledger closes

#### Scenario: Escape closes without side effects

- **WHEN** a panel is open during a wave and the player presses Escape
- **THEN** the panel closes, the wave keeps running, and no tool or selection changes

#### Scenario: A click on the board closes the panel and still reaches the board

- **WHEN** a panel is open and the player clicks a tile outside it
- **THEN** the panel closes and the click is handled by the board as if no panel had been open

#### Scenario: Keyboard toggle

- **WHEN** the treasury readout has focus and the player presses Enter
- **THEN** the gold ledger opens and the readout reports itself as expanded

### Requirement: Both panels show the period that belongs to the latest wave start

The gold ledger and the energy balance SHALL show the same ledger period under one rule: once a
wave has started in the open period, the open period — live while the wave runs, frozen once
it settles into the closed slot — labelled with that wave's number; until then (the build phase
before a wave, and the run's start) the closed period, labelled with its wave number. Before
any wave has run there is no closed period and the panels SHALL say so rather than show zeros.
After the run ends the panels SHALL remain available and follow the same rule.

#### Scenario: During a wave the panels are live

- **WHEN** wave 4 is running and the player opens either panel
- **THEN** it is labelled wave 4 and its figures change as the wave proceeds

#### Scenario: During the build phase the panels show the last wave

- **WHEN** wave 4 has settled and the player opens either panel during the build phase
- **THEN** it is labelled wave 4 and shows wave 4's final figures

#### Scenario: Starting the next wave flips both panels

- **WHEN** the player starts wave 5 with the gold ledger open
- **THEN** on the next rendered frame the ledger is labelled wave 5 and the energy balance,
  when opened, is labelled wave 5 as well

#### Scenario: Before the first wave

- **WHEN** the player opens the energy balance before wave 1 has started
- **THEN** the panel states that no wave has run yet and shows no figures

### Requirement: The gold ledger reconciles to the treasury readout

The gold ledger SHALL list, for the shown period, its opening balance, then one row per cash
flow — bounties, wave bonus, interest, construction (net), energy (the grid bill), stolen,
recovered — with a sign per row, then a closing line. During the build phase the closed period
SHALL be followed by a second block for the open period, labelled as preparing the next wave,
holding its construction so far and a balance line. The figures SHALL be shown in whole gold,
and rounding SHALL be applied so that every block's displayed rows sum exactly to the
difference between its displayed opening and closing lines, and the final balance line SHALL
equal the treasury readout above the panel. The ledger SHALL never show an energy figure other
than the bill, and SHALL never show a "saved" or "avoided" amount.

#### Scenario: The rows add up

- **WHEN** wave 3 opened at 412, earned 180 in bounties, 25 bonus and 6 interest, spent 140 on
  construction and 13 on energy, lost 40 to theft and recovered 30
- **THEN** the ledger shows those rows signed, a closing line of 460, and a reader summing the
  displayed rows from the displayed opening reaches exactly the displayed closing

#### Scenario: The preparing block chains to the readout

- **WHEN** wave 3 closed at 460 and the player has since spent 95 on construction in the build
  phase
- **THEN** the ledger shows wave 3's block closing at 460, then a block preparing wave 4 with
  construction −95 and a balance of 365, and the treasury readout reads 365

#### Scenario: Rounding never breaks the chain

- **WHEN** the period's milli-gold rows do not individually floor to figures that sum to the
  whole-gold delta
- **THEN** the displayed rows are adjusted by at most one gold each so that they do, and the
  opening, closing and balance lines are unchanged by the adjustment

#### Scenario: A connection upgrade shows as construction

- **WHEN** the player bought a connection tier during the shown period
- **THEN** its cost is inside the construction row; no separate row appears

### Requirement: The energy balance shows usage against sources in kWh

The energy balance SHALL show two columns for the shown period that total the same figure:
usage — engaged, standby, wasted — and sources in merit order — solar, grid marked as billed,
unmet. Energy SHALL be presented in kWh to one decimal under the convention that one real
second of wave time is one game hour, and rounding SHALL be applied so that each column's
displayed rows sum exactly to the displayed total. The panel header SHALL show the level's
tariff in gold per kWh, which under the same convention is the authored tariff figure. The
panel SHALL show no gold amount and no savings figure.

#### Scenario: Both columns total the same

- **WHEN** wave 4 ran with 31.2 kWh engaged, 8.1 standby and 3.7 wasted, supplied by 30.5 solar
  and 12.5 grid with 0 unmet
- **THEN** both columns show a total of 43.0 and the grid row is marked as billed

#### Scenario: The tariff reads as authored

- **WHEN** the level's power tariff is authored as 0.24
- **THEN** the panel header reads 0.24 gold per kWh

#### Scenario: Unmet carries no gold

- **WHEN** the shown period had brownout ticks
- **THEN** the unmet row shows its kWh and the panel shows no gold figure for it or for any
  other row

#### Scenario: Short waves still read

- **WHEN** an opening wave lasts twelve seconds at a mean draw of 0.9 kW
- **THEN** the totals read about 10.8 kWh — one decimal, not 0.0 — because a second of wave
  time is presented as an hour
