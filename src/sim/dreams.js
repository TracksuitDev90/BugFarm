// Critters' dreams (see data/dreams.js): each grown-up picks one, the world's
// events move it along, and when it comes true the critter becomes a master
// of its trade. Lives in the journal beside the zone goals, so dreams keep
// coming true while the tank catches up on time away.
import { DREAMS, dreamsFor, dreamText } from '../data/dreams.js';

// Which critters an event counts for.
function whoOf(dr, d, w) {
  switch (dr.who) {
    case 'pred':
      return d.pred ? [d.pred] : [];
    case 'by':
      return d.by && d.by.kind === 'creature' ? [d.by] : [];
    case 'parents':
      return (d.parents || []).filter(Boolean);
    case 'both':
      return [d.c, d.p].filter(Boolean);
    case 'aphid':
      return d.aphid ? [d.aphid] : [];
    case 'all':
      return w.creatures.filter((c) => !c.dead && dreamsFor(c).includes(dr));
    default:
      return d.c ? [d.c] : [];
  }
}

export class Dreams {
  constructor() {
    this.world = null;
    this.offs = [];
    this.come = 0; // dreams that have come true in this tank
    this.onDream = null;
  }

  attach(world) {
    for (const off of this.offs) off();
    this.offs = [];
    this.world = world;
    this.byEvent = {};
    for (const list of Object.values(DREAMS)) {
      for (const dr of list) {
        const l = this.byEvent[dr.on] || (this.byEvent[dr.on] = []);
        if (!l.includes(dr)) l.push(dr);
      }
    }
    for (const ev of Object.keys(this.byEvent)) this.offs.push(world.events.on(ev, (d) => this.onEvent(ev, d)));
  }

  // A critter's dream, chosen the first time anyone asks (once it's grown).
  dreamOf(c) {
    if (!c || c.dead || !c.isAdult) return null;
    const list = dreamsFor(c);
    if (!list.length) return null;
    const m = c.memory;
    if (!m.dream) m.dream = { i: (c.id * 7 + c.accSeed) % list.length, n: 0 };
    return list[m.dream.i % list.length];
  }

  onEvent(ev, d) {
    const w = this.world;
    for (const dr of this.byEvent[ev]) {
      if (dr.test && !dr.test(d, w)) continue;
      for (const c of whoOf(dr, d, w)) {
        if (!c || c.dead || c.memory.master) continue;
        if (this.dreamOf(c) !== dr) continue;
        // young minds learn quicker with the schoolhouse about
        const step = (dr.count ? dr.count(d) : 1) * (w.owns('schoolhouse') ? 1.5 : 1);
        c.memory.dream.n += step;
        if (c.memory.dream.n >= dr.n) this.cameTrue(c, dr);
      }
    }
  }

  cameTrue(c, dr) {
    const w = this.world;
    c.memory.master = dr.title;
    c.memory.dream.n = dr.n;
    this.come++;
    c.emote('star', 2.5);
    w.sparkle(c.x, c.y - 6, 12);
    const coins = w.earn(2, `${c.name}'s dream`, c.x, c.y - 10);
    // (a whole colony of ants would fill the screen with news: theirs go in the diary)
    w.addLog(`${c.name} the ${c.def.name.toLowerCase()}'s dream came true: ${dreamText(dr).toLowerCase()}! Now a ${dr.title.toLowerCase()}. Busytown sent ${coins} coins.`, c.def.colony ? 'leaf' : 'star');
    w.events.emit('dream', { c, dream: dr });
    if (this.onDream) this.onDream(c, dr);
  }

  // How far along a critter's dream is: { dream, n, f, done }.
  progress(c) {
    const dr = this.dreamOf(c);
    if (!dr) return null;
    const n = Math.min(dr.n, Math.floor(c.memory.dream.n));
    return { dream: dr, n, f: Math.min(1, c.memory.dream.n / dr.n), done: !!c.memory.master, text: dreamText(dr) };
  }

  serialize() {
    return { come: this.come };
  }
  load(d) {
    this.come = (d && d.come) || 0;
  }
}
