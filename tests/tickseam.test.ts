// The commit/advance seam — time-controls design D2.
//
// ENFORCES the deterministic-sim contract that a stopped game can absorb player
// intent without consuming time. The whole-run composition check
// (commit+advance == tick at every tick) lives in replay.test.ts, next to the
// scripted session it runs against; this file pins the finer properties the
// paused path depends on:
//
//   - commit is repeatable: N separate commits == one batched commit
//   - commit consumes no time: no movement, no firing, no tick increment
//
// Both matter because the paused loop commits once per player action, where a
// replay commits the whole tick's batch at once. If those diverged, a paused
// session would not reproduce.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/sim/commands';
import { injectEnemy, makeSim, openLevel, place, testBalance } from './helpers';

/** 8×8 open board, treasury far from spawn, with room to wall without sealing. */
function board() {
  return makeSim(
    openLevel(8, 8, { x: 0, y: 0 }, { x: 7, y: 7 }),
    testBalance({ speed: 200 }),
  );
}

describe('commit is repeatable', () => {
  it('N separate commits equal one batched commit in the same order', () => {
    // Same command objects for both sims: `seq` is not sim state, but reusing
    // them removes any doubt that the two runs saw identical input.
    const commands: Command[] = [place('wall', 3, 3), place('wall', 3, 4), place('wall', 4, 3)];

    const separate = board().sim;
    const batched = board().sim;
    injectEnemy(separate, 2, 2, { speed: 200 });
    injectEnemy(batched, 2, 2, { speed: 200 });

    for (const c of commands) separate.commit([c]);
    batched.commit(commands);

    expect(separate.hash()).toBe(batched.hash());

    // ...and they stay converged once time runs.
    separate.advance();
    batched.advance();
    expect(separate.hash()).toBe(batched.hash());
  });

  it('an extra no-op commit changes nothing, mask sweep included', () => {
    const { sim } = board();
    injectEnemy(sim, 2, 2, { speed: 200 });

    // A wall placement flips maskChanged, so this commit runs the commitment
    // sweep — the step most at risk of not being idempotent.
    sim.commit([place('wall', 3, 3)]);
    const after = sim.hash();

    sim.commit([]);
    sim.commit([]);
    expect(sim.hash()).toBe(after);
  });

  it('re-snapshotting prevPos on an unmoved entity is a no-op', () => {
    const { sim } = board();
    const enemy = injectEnemy(sim, 2, 2, { speed: 200 });

    sim.advance(); // move once, so prevPos and pos genuinely differ
    const movedTo = { x: enemy.pos.x, y: enemy.pos.y };
    expect(enemy.prevPos).not.toEqual(movedTo);

    sim.commit([]);
    expect(enemy.prevPos).toEqual(movedTo);
    expect(enemy.pos).toEqual(movedTo);

    // A second commit cannot drift it further.
    sim.commit([]);
    expect(enemy.prevPos).toEqual(movedTo);
  });
});

describe('commit consumes no time', () => {
  it('leaves the tick counter and every entity position untouched', () => {
    const { sim } = board();
    const enemy = injectEnemy(sim, 2, 2, { speed: 200 });
    const startTick = sim.state.tick;
    const startPos = { x: enemy.pos.x, y: enemy.pos.y };

    sim.commit([place('wall', 5, 5)]);

    expect(sim.state.tick).toBe(startTick);
    expect(enemy.pos).toEqual(startPos);

    // The very next advance is what moves it — proving the enemy was mobile all
    // along and the commit, not a parked speed, is what held it still.
    sim.advance();
    expect(sim.state.tick).toBe(startTick + 1);
    expect(enemy.pos).not.toEqual(startPos);
  });

  it('does not spawn a wave that has been started but not advanced', () => {
    const { sim } = board();

    sim.commit([{ kind: 'startWave', seq: 0 }]);
    expect(sim.state.runPhase).toBe('wave'); // the command applied...
    expect(sim.state.enemies).toHaveLength(0); // ...but step 4 has not run

    sim.advance();
    expect(sim.state.enemies.length).toBeGreaterThan(0);
  });
});
