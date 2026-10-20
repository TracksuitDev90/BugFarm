// "While you were away": when the game is reopened, the tank catches up on
// the time that passed (capped, so nobody gets neglected for a week). It runs
// the real simulation with a coarse time step, in slices, so the page stays
// responsive on slow phones.
import { DAY_LEN } from '../config.js';

export const AWAY_CAP = DAY_LEN * 1.25; // at most about a day of tank time
const STEP = 0.6;

export function awaySeconds(realSeconds) {
  return Math.min(realSeconds, AWAY_CAP);
}

export function catchUp(world, gameSeconds, onProgress) {
  return new Promise((resolve) => {
    const summary = { seconds: gameSeconds, born: 0, died: [], eaten: 0, dug: 0, sprouts: 0, metamorph: [], logs: [] };
    if (gameSeconds < 20) {
      resolve(null);
      return;
    }
    const dug0 = world.colonies.reduce((a, c) => a + c.dug, 0);
    const offs = [
      world.events.on('birth', (d) => (summary.born += d.n || 1)),
      world.events.on('death', (d) => {
        if (d.cause === 'eaten') summary.eaten++;
        else if (d.c.isAdult && d.c.sp !== 'fruitfly' && d.c.sp !== 'aphid') summary.died.push(d.c.name + ' the ' + d.c.def.name.toLowerCase());
      }),
      world.events.on('sprout', () => summary.sprouts++),
      world.events.on('metamorph', (d) => summary.metamorph.push(d.c.name)),
      world.events.on('log', (l) => summary.logs.push(l.text)),
    ];
    const fx = world.fx;
    world.fx = null;
    world.awayMode = true;
    let left = gameSeconds;
    const total = gameSeconds;
    const slice = () => {
      const t0 = performance.now();
      while (left > 0 && performance.now() - t0 < 24) {
        const dt = Math.min(STEP, left);
        world.step(dt);
        left -= dt;
      }
      if (onProgress) onProgress(1 - left / total);
      if (left > 0) setTimeout(slice, 0);
      else {
        world.fx = fx;
        world.awayMode = false;
        for (const off of offs) off();
        summary.dug = world.colonies.reduce((a, c) => a + c.dug, 0) - dug0;
        // Settle positions so nothing pops on the first rendered frame.
        for (const c of world.creatures) {
          c.px = c.x;
          c.py = c.y;
          c.pangle = c.angle;
        }
        resolve(summary);
      }
    };
    slice();
  });
}
