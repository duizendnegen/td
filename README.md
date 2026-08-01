# Maze Tower Defense — POC

A proof-of-concept for a maze-building tower defense game where enemies steal from your treasury and your money is your health.

## POC Goals

Demonstrate feasibility of:

1. Dynamic maze-building on a grid with live re-pathing
2. The treasury/theft economy loop (money = health)
3. Isometric camera view (purely cosmetic in POC — a fixed orthographic isometric projection over the 3D kit)
4. Four tower archetypes vs. three enemy types with rock-paper-scissors pressure

## Technical Foundation

- **Stack:** TypeScript + Canvas (web-first; instantly shareable via link).
- **Fixed-tick deterministic simulation** (~20 ticks/sec), fully separated from rendering. Rendering interpolates between sim states. This is non-negotiable groundwork for later co-op (lockstep or server-authoritative both depend on it).
- **Sim code stays engine/framework-agnostic** — plain classes, no render-loop logic.
- **Flow-field pathing**, not per-enemy A*. One BFS from each goal outward per placement event; enemies read their tile's direction.
- **Two flow fields** maintained at all times: one toward the treasury (inbound), one toward spawn/exits (returning). Enemies read the field matching their state.
- **Placement validation:** before confirming any tower/wall, rebuild the field; if any active spawn cannot reach the treasury, reject the placement. Full blocks are impossible by construction.
- **Enemies live in a flat array** as the source of truth. No tile-occupancy grid as primary storage; a spatial hash can be added later as a derived structure if range checks ever become a bottleneck (they won't at this scale).

## Grid & Movement

- **30×20 playable tiles.** Every structure — wall or tower — occupies a **1×1 footprint**: towers are wall segments that shoot, so they slot directly into wall lines and the whole maze shares one building vocabulary. (Phase-2 playtest rework: the original 2×2 tower footprint could not join 1-wide wall lines and fought the mazing.)
- **Diagonal movement allowed**, with corner-cutting prevented: the flow field never points diagonally between two blocked tiles (enforced at field-build time).
- **Enemy position is continuous:** `(x, y)` floats in tile-space. Current tile = `(floor(x), floor(y))` — used for field lookup, gold drops, and pickups.
- **Movement is waypoint-based:** enemies steer toward the *center of the next tile* the field indicates, not along raw field vectors. On arrival (within epsilon) they re-read the field and pick the next center. This prevents wall-hugging and gives smooth re-pathing.
- The cached **current waypoint** is one tile of commitment: it prevents jitter under rapid placements and doubles as a hook for detecting turn-arounds (anti-juggling) later.

### Enemy struct (minimal)

```
pos(x, y)         // floats, tile-space
waypoint(tx, ty)  // committed next tile center
state             // inbound | returning
hp
carriedGold
slowUntil         // tick number; strongest-slow-wins = max()
typeRef           // stat block reference
```

## Economy: Treasury = Health

Treasury and build-gold are **one pool**. Spending on towers lowers the same balance thieves attack. There is no abstract life counter.

- **Theft:** each enemy type has a `carryCapacity`. On reaching the treasury it grabs `min(capacity, balance)` and flips to `returning`, pathing toward the **nearest active spawn**.
- **Carriers** move at **80% speed** and display a gold-sack status icon.
- **Returning carriers take the maze back** through the gauntlet — walls block both directions, so every kill near the treasury gets a second chance on the way out. The maze defends twice.
- **Dropped gold:** killing a carrier drops its sack on its tile. Any enemy (inbound or outbound) walking over it picks it up, up to remaining capacity — a swarm can distribute a large sack. An inbound enemy that picks up gold **immediately flips to returning**.
- Unclaimed sacks return to the treasury at end of wave. Gold that escapes through a spawn is **gone** — no mercy.
- **Kill bounties** go straight to the treasury and are meaningful (primary income).
- **Interest** accrues **only during waves** (build phase earns nothing), as a percentage of held balance per tick. No cap initially — the system self-balances: hoarding earns interest but leaves you undertowered against thieves. Interest is a skill-expression lever that rewards restraint and punishes overspending.
- **Bankruptcy:** you **lose when the treasury hits −100**. You **cannot spend on towers while below 0**. Going negative via theft is survivable; it's a death spiral warning, not instant death.
- Death-spiral mitigation, if testing demands it: a small flat per-wave stipend — never a softening of theft itself.

## Towers

Four archetypes, each with a **3-level upgrade path**. Each archetype upgrades along two identity axes (rapid: rate+damage; sniper: range+damage; area: range+damage; slow: range+duration), with hand-authored stat rows and each level's cost matched to its compounded power (~1.7×/level). Targeting priority is **fixed per tower type**.

| Tower | Role | Priority |
|---|---|---|
| Rapid fire | Single-target DPS baseline | First (furthest along path) |
| Sniper | High damage, long range, slow rate; anti-armor | **Carriers first**, then strongest |
| Area damage | Anti-swarm; extra value on gold-drop clusters | First |
| Slow | Force multiplier, no kill power | First |

- **Slow does not stack** — strongest slow wins (`slowUntil = max(...)`).
- Sniper's carrier priority makes treasury-side placement a distinct defensive role from spawn-side placement — the maze has two meaningful ends.

## Enemies

Three types for the POC, each designed to punish a missing tower:

| Type | Punishes | Notes |
|---|---|---|
| Swarm | No AoE | Cheap, numerous, low HP |
| Tank | No sniper | High HP, slow, large carry capacity |
| Runner | No slow | Fast, low HP |

- At least one type is **slow-immune** (introduced in later waves).
- Stat block per type: `hp, speed, carryCapacity, bounty, slowImmune`.
- **Status icons** hover above enemies for special conditions: carrying gold, slowed. No general status-effect system at this scope.

## Build Rules & Anti-Juggling

- **No timer in the build phase** — plan as long as you like. Building during waves is allowed and instant.
- **Removing a wall/tower takes 3–5 seconds** (removal delay). This is the anti-juggling rule: open/close treadmill exploits require fast removal cycles; a delay kills them without banning legitimate mid-wave construction.
- Fully sealing the path is impossible (placement validation rejects it).
- Fallback if juggling persists in testing: penalize enemies whose new waypoint equals their previous tile (turn-around detection) — the hook already exists in the waypoint cache.

## Waves & Levels

- **Waves are hand-authored data, not formulas.** The wave curve teaches the rock-paper-scissors: e.g. wave 3 introduces runners, wave 5 is a tank check, wave 7 a swarm check.
- **Multiple spawn points**, each with an activation wave — a second front opening mid-run reshapes the maze problem. POC ships with levels using one and two spawns.
- **10 waves** per POC level.
- Enemy stat blocks and tower definitions live in a **shared balance file**; level files are pure composition referencing them by `type`.

### Level data format

```json
{
  "id": "level_01",
  "grid": { "width": 30, "height": 20 },
  "treasury": { "x": 27, "y": 10 },
  "spawns": [
    { "id": "west", "x": 0, "y": 10, "activeFromWave": 1 },
    { "id": "north", "x": 15, "y": 0, "activeFromWave": 6 }
  ],
  "terrain": { "blocked": [[5,5],[5,6]], "prebuilt": [] },
  "economy": {
    "startingTreasury": 200,
    "interestRatePerTick": 0.0004
  },
  "waves": [
    {
      "wave": 1,
      "groups": [
        { "spawn": "west", "type": "swarm", "count": 8,
          "spawnInterval": 0.8, "delay": 0 }
      ]
    },
    {
      "wave": 6,
      "groups": [
        { "spawn": "west", "type": "tank", "count": 3,
          "spawnInterval": 2.0, "delay": 0 },
        { "spawn": "north", "type": "runner", "count": 6,
          "spawnInterval": 0.5, "delay": 3.0 }
      ]
    }
  ]
}
```

## Visuals

Tower Defense Kit bundle from Kenney's Assets. Iconographic placeholders when assets are missing.

## Build Order

1. Grid + dual flow fields + one enemy walking in and back out. **Watch the theft round-trip before building anything else** — if it feels good, everything else is layering.
2. Placement + validation + removal delay.
3. Towers (rapid fire first), damage, bounties.
4. Full theft loop: carry, drop, pickup, flip-to-returning, end-of-wave return.
5. Remaining towers, upgrades, slow + icons.
6. Wave loader, interest, bankruptcy, two levels.
7. Isometric view.
