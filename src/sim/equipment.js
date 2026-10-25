// The keeper's equipment: what each piece is, where it sits in the tank (so
// a tap can find it) and how it's doing, in plain words for its info card.
// Pure functions of the world, like care.js, so they run headless too.
import { LAMP_X, MISTER_X, HEATER_X, FILTER_X } from '../world/environment.js';
import { X } from '../config.js';
import { zoneBand, zoneStatus, ZONE_NAMES } from './care.js';
import { clamp01 } from '../util/math.js';

// Stick-on strip thermometers on the glass, one per zone.
export const GAUGE_AT = { desert: [34, 40], pond: [X(580), 40], jungle: [X(1492), 40] };

// Tap areas in world units: [x0, y0, x1, y1].
function boxes(w) {
  const wl = w.terrain.waterLevel;
  const out = [];
  for (const z of ['desert', 'pond', 'jungle']) out.push({ id: 'lamp', zone: z, box: [LAMP_X[z] - 22, -30, LAMP_X[z] + 30, 40] });
  for (const z of ['desert', 'jungle']) out.push({ id: 'mister', zone: z, box: [MISTER_X[z] - 7, -33, MISTER_X[z] + 52, 26] });
  out.push({ id: 'heater', zone: 'pond', box: [HEATER_X - 10, wl - 32, HEATER_X + 12, wl + 70] });
  out.push({ id: 'filter', zone: 'pond', box: [FILTER_X - 26, wl - 20, FILTER_X + 15, wl + 52] });
  for (const [z, [x, y]] of Object.entries(GAUGE_AT)) out.push({ id: 'gauge', zone: z, box: [x - 9, y - 6, x + 9, y + (z === 'pond' ? 64 : 84)] });
  return out;
}

// The piece of equipment under a tap, as a selectable thing for the info card.
export function equipmentAt(w, x, y, slop = 0) {
  for (const e of boxes(w)) {
    const [x0, y0, x1, y1] = e.box;
    if (x > x0 - slop && x < x1 + slop && y > y0 - slop && y < y1 + slop) {
      return { kind: 'equip', id: e.id, zone: e.zone, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    }
  }
  return null;
}

// Where a selected piece of equipment is now (the pond gear rides the water line).
export function equipmentBox(w, e) {
  const b = boxes(w).find((o) => o.id === e.id && o.zone === e.zone);
  return b ? b.box : null;
}

export const EQUIP_NAMES = { lamp: 'Heat lamp', mister: 'Mister', heater: 'Pond heater', filter: 'Pond filter', gauge: 'Thermometer' };

const pct = (v) => Math.round(clamp01(v) * 100) + '%';
const damp = (m) => (m < 0.15 ? 'bone dry' : m < 0.35 ? 'dry' : m < 0.6 ? 'a bit damp' : m < 0.8 ? 'damp' : 'soggy');

// Everything the info card shows for a piece of equipment.
//   { name, sub, what, meters: [[label, 0..1, colour]], actions: [[id, label, style]] }
// fmt formats a temperature in the keeper's units.
export function equipmentInfo(w, e, fmt = (t) => Math.round(t) + '°C') {
  const env = w.env;
  const z = e.zone;
  const Z = ZONE_NAMES[z].toLowerCase();
  const st = zoneStatus(w, z, zoneBand(w, z));
  const comfy = `comfy is ${fmt(st.band.t[0])}–${fmt(st.band.t[1])}`;
  switch (e.id) {
    case 'lamp': {
      const p = env[z].lamp;
      const spot = z === 'pond' ? 'the basking rock' : 'right underneath';
      return {
        name: `${ZONE_NAMES[z]} heat lamp`,
        sub: p > 0.02 ? `Dimmer at ${pct(p)} · ${z === 'pond' ? 'water' : 'air'} ${fmt(st.T)}, ${comfy}` : `Switched off · ${z === 'pond' ? 'water' : 'air'} ${fmt(st.T)}, ${comfy}`,
        what: `A dome lamp clamped to the lid. Its warm bulb heats the ${Z} and makes a toasty basking spot ${spot}. The dial on its cord is the dimmer: turn it up when the ${Z} is chilly, down when it's too hot.${w.owns('climate') ? ' The clockwork climate keeper turns it up and down for you.' : ''}`,
        meters: [['Dimmer', p, '#f0913a']],
        actions: [['lampDown', 'Cooler'], ['lampUp', 'Warmer'], ['climate', 'All controls', 'yellow']],
      };
    }
    case 'mister': {
      const m = env[z].mister;
      const water = env[z].water;
      const spraying = env.misting(z);
      const state = m <= 0.02 ? 'Switched off' : spraying > 0.02 ? `Spraying at ${pct(m)}` : 'The jug is empty, so it has stopped spraying!';
      const acts = [['mistDown', 'Less rain'], ['mistUp', 'More rain']];
      if (water < 0.97) acts.unshift(['refill', 'Refill jug', water < 0.25 ? 'yellow' : 'blue']);
      return {
        name: `${ZONE_NAMES[z]} mister`,
        sub: `${state} · air is ${damp(env[z].moist)}`,
        what: 'A little pump drinks from the water jug and sprays fine rain through the nozzle under the lid, which keeps the air damp. The dial sets how much it sprays. ' + (w.owns('rainBarrel') ? 'The rain barrel keeps its jug topped up.' : 'When the jug runs dry the rain stops, so refill it.') + (w.owns('climate') ? ' The climate keeper turns it up and down for you.' : ''),
        meters: [['Jug', water, water < 0.2 ? '#e2553f' : '#7cc0e6'], ['Damp air', env[z].moist, '#4c8fd6']],
        actions: acts,
      };
    }
    case 'heater': {
      const p = env.pond;
      const heating = p.heater && p.temp < p.heaterTarget - 0.3;
      return {
        name: 'Pond heater',
        sub: p.heater ? `On · set to ${fmt(p.heaterTarget)} · ${heating ? 'warming the water up' : 'holding it steady'}` : `Switched off · the water follows the room (${fmt(p.temp)})`,
        what: 'A glass heater standing in the water, held to the glass with suction cups. Set its dial and it keeps the pond at that temperature, even when the room gets chilly. Its light glows orange while it is warming. It can only warm, never cool.',
        meters: [],
        actions: [['heaterToggle', p.heater ? 'Switch off' : 'Switch on', p.heater ? '' : 'yellow'], ['heaterDown', '−1°'], ['heaterUp', '+1°']],
      };
    }
    case 'filter': {
      const p = env.pond;
      return {
        name: 'Pond filter',
        sub: p.filter <= 0.02 ? 'Switched off' : p.filterClean < 0.35 ? 'The sponge is clogged with gunk!' : `Pumping at ${pct(p.filter)} · sponge ${pct(p.filterClean)} clean`,
        what: 'A pump pulls pond water in through the slots at the bottom, through a sponge that catches the gunk, and pushes it back out of the spout at the top. That stirs fresh air into the water and keeps it clear. The sponge turns brown as it fills up: rinse it out.',
        meters: [['Sponge', p.filterClean, p.filterClean < 0.35 ? '#c98a4a' : '#f0bf45'], ['Air in water', p.oxygen, p.oxygen < 0.45 ? '#e2553f' : '#7cc0e6'], ['Clear water', p.clarity, p.clarity < 0.6 ? '#c98a4a' : '#77b255']],
        actions: [...(p.filterClean < 0.97 ? [['rinse', 'Rinse sponge', p.filterClean < 0.35 ? 'yellow' : 'blue']] : []), ['filterDown', 'Slower'], ['filterUp', 'Faster']],
      };
    }
    case 'gauge': {
      return {
        name: `${ZONE_NAMES[z]} thermometer`,
        sub: `${fmt(st.T)} now · ${comfy}${st.M != null ? ` · air ${damp(st.M)}` : ''}`,
        what: `A strip thermometer stuck on the glass. The red line shows how warm the ${Z} is right now. The green patch is what the critters living there find comfy, so keep the red line in the green.${z !== 'pond' ? ' The little dial underneath shows how damp the air is.' : ''}`,
        meters: [],
        actions: [['clip', 'Open the clipboard', 'yellow'], ['climate', 'Climate controls']],
      };
    }
    default:
      return { name: EQUIP_NAMES[e.id] || 'Equipment', sub: '', what: '', meters: [], actions: [] };
  }
}
