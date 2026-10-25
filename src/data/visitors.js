// Visitors from the garden outside. Now and then, when the tank is happy
// and lively, someone drops in: they come in over the side of the glass
// (or flutter down through the lid), potter about the zone they like for a
// few hours, and go home. Who comes depends on how the keeper has built
// their world, and every visitor brings something: a rare thing to keep,
// or an offer to make the tank better. An offer always asks the keeper
// first, and only ever changes things for the better.
//   zone:   where they like to be
//   move:   walk | dig (pops up out of the ground) | fly | swim
//   when:   day | night | any (when they turn up)
//   speed:  how fast they potter about (world units a second)
//   cheer:  how happy the tank has to be before they'll come (0..1)
//   want:   how welcome the tank makes them feel right now, 0..1 (0: they
//           won't come). It's what the keeper builds that decides.
//   likes:  what they like, for the Visitors' Book (once met)
//   hint:   how to tempt them, for the Visitors' Book (before they've come)
//   gift:   what they bring on their first visit (and again later, until
//           `max`): kind 'decor' (they build one), 'tunnels' (dig the soil
//           to let the air in), 'sow' (plant something, and the keeper can
//           plant it too from then on), 'outfit' (something for the
//           critters to wear). ask: their offer (a gift that changes the
//           tank asks first); done: what happened.
//   lines:  what they might be thinking
import { DAY_LEN } from '../config.js';

const count = (w, sps, zone) => w.creatures.filter((c) => !c.dead && sps.includes(c.sp) && c.isAdult && (!zone || w.env.zoneAt(c.x) === zone)).length;
const plantsIn = (w, zone, test) => w.plants.filter((p) => !p.dead && p.growth > 0.4 && w.env.zoneAt(p.x) === zone && test(p)).length;
const decorIn = (w, zone, test) => w.decor.filter((d) => w.env.zoneAt(d.x) === zone && test(d)).length;
const openFlowers = (w, zone) => {
  let n = 0;
  for (const p of w.plants) if (!p.dead && w.env.zoneAt(p.x) === zone && p.growth > 0.6) n += p.flowers.length;
  return n;
};

export const VISITORS = {
  hedgehog: {
    name: 'Hazel',
    animal: 'hedgehog',
    zone: 'jungle',
    move: 'walk',
    when: 'night',
    speed: 14,
    cheer: 0.45,
    want: (w) => {
      const recyclers = count(w, ['pillbug', 'beetle', 'snail', 'worm'], 'jungle');
      if (recyclers < 3) return 0;
      const homes = decorIn(w, 'jungle', (d) => d.def.shelter);
      const litter = w.foods.filter((f) => f.type === 'leaves' && w.env.zoneAt(f.x) === 'jungle').length;
      return Math.min(1, recyclers / 6) * (homes ? 1 : 0.5) * (litter ? 1 : 0.7);
    },
    likes: 'Crunchy fallen leaves, beetles and pill bugs to snuffle along with, and somewhere snug.',
    hint: 'A jungle floor with pill bugs or beetles about, fallen leaves and a home or two. Comes out at night.',
    gift: { kind: 'decor', decor: 'leafPile', max: 2, ask: 'Such lovely fallen leaves! May I rake some into a cosy leaf pile? Pill bugs and beetles love living in one.', done: 'Hazel raked the fallen leaves into a cosy leaf pile in the jungle.' },
    lines: ['Snuffle, snuffle...', 'Such crunchy leaves!', 'Hello, little beetle!', 'What a lovely night for a stroll.'],
  },
  mole: {
    name: 'Mortimer',
    animal: 'mole',
    zone: 'jungle',
    move: 'dig',
    when: 'any',
    speed: 30,
    cheer: 0.5,
    want: (w) => {
      const worms = count(w, ['worm']);
      if (worms < 3) return 0;
      return Math.min(1, worms / 6) * Math.min(1, (w.env.fertility.jungle || 0) / 0.75);
    },
    likes: 'Rich, crumbly soil and plenty of earthworms.',
    hint: 'Rich jungle soil (worms and beetles make it so) and a few earthworms.',
    gift: { kind: 'tunnels', max: 2, ask: 'Your soil is ever so rich! May I dig some tunnels to let the air in? Plants grow faster in airy soil, and worms love a tunnel.', done: 'Mortimer dug a network of tunnels under the jungle. The soil is lovely and airy now, and the plants will grow faster.' },
    lines: ['Mmm, what lovely soil.', 'Is it daytime? I can never tell.', 'Dig, dig, dig!', 'These worms are very good company.'],
  },
  robin: {
    name: 'Rosie',
    animal: 'robin',
    zone: 'jungle',
    move: 'fly',
    when: 'day',
    speed: 60,
    cheer: 0.5,
    want: (w) => {
      const flowers = openFlowers(w, 'jungle');
      if (flowers < 5) return 0;
      const kinds = new Set(w.plants.filter((p) => !p.dead && p.flowers.length && w.env.zoneAt(p.x) === 'jungle').map((p) => p.type)).size;
      return Math.min(1, flowers / 12) * Math.min(1, kinds / 4);
    },
    likes: 'A garden of many different flowers.',
    hint: 'Lots of flowers in the jungle, of lots of different kinds. Comes by day.',
    gift: { kind: 'sow', choose: ['cornflower', 'bluebell', 'daisy', 'tulip', 'sunflower', 'orchid', 'hibiscus'], n: [3, 4], ask: 'I brought some {plant} seeds from the meadow. May I sow them in your jungle?', done: 'Rosie sowed a patch of {plants} in the jungle.' },
    lines: ['Tweet tweet!', 'What a pretty garden.', 'So many flowers!', 'I can see the whole jungle from up here.'],
  },
  kingfisher: {
    name: 'Kip',
    animal: 'kingfisher',
    zone: 'pond',
    move: 'fly',
    when: 'day',
    speed: 80,
    cheer: 0.6,
    want: (w) => {
      const pond = w.env.pond;
      if (pond.clarity < 0.75) return 0;
      const fish = count(w, ['goldfish', 'guppy', 'tetra', 'koi', 'puffer']);
      const perches = plantsIn(w, 'pond', (p) => p.def.place === 'shore');
      if (fish < 5 || !perches) return 0;
      return Math.min(1, fish / 10) * (pond.clarity > 0.88 ? 1 : 0.6);
    },
    likes: 'Crystal-clear water, plenty of fish to admire and a reed to perch on.',
    hint: 'Very clear pond water, lots of fish and cattails or irises by the water to perch on. Comes by day.',
    gift: { kind: 'outfit', item: 'feather', done: 'Kip left a shining blue feather behind. It makes a very smart hat! Find it in the wardrobe (tap a critter, then Dress up).' },
    lines: ['What a sparkling pond!', 'Just admiring the fish. Only admiring!', 'Lovely clear water.', 'Zip!'],
  },
  vole: {
    name: 'Wilma',
    animal: 'water vole',
    zone: 'pond',
    move: 'swim',
    when: 'any',
    speed: 18,
    cheer: 0.5,
    want: (w) => {
      const reeds = plantsIn(w, 'pond', (p) => p.def.place === 'shore');
      const lilies = plantsIn(w, 'pond', (p) => p.def.kind === 'lily');
      if (reeds < 2 || lilies < 2 || w.env.pond.clarity < 0.6) return 0;
      return Math.min(1, (reeds + lilies) / 6);
    },
    likes: 'A clean pond with lily pads to swim between and reeds along the bank.',
    hint: 'Water lilies in a clean pond, and cattails or irises along the bank.',
    gift: { kind: 'sow', plant: 'lotus', n: [1, 1], max: 3, ask: 'What a lovely pond! May I plant a lotus? Its blooms are even prettier than a water lily\'s, and you can pick them just the same.', done: 'Wilma planted a lotus in the pond. Its blooms can be picked like water lilies.' },
    lines: ['Paddle, paddle.', 'Such lovely lily pads!', 'Ooh, the water\'s just right.', 'Hello, fishies!'],
  },
  crab: {
    name: 'Hector',
    animal: 'hermit crab',
    zone: 'desert',
    move: 'walk',
    when: 'any',
    speed: 12,
    cheer: 0.45,
    beach: true,
    want: (w) => {
      const T = w.env.desert.temp;
      if (T < 22) return 0;
      const shells = decorIn(w, 'pond', (d) => d.type === 'shell' || d.type === 'chest');
      const desert = decorIn(w, 'desert', () => true);
      return Math.min(1, 0.4 + shells * 0.4 + desert * 0.1) * (T > 25 ? 1 : 0.7);
    },
    likes: 'A warm sandy beach and the seaside things the keeper puts in the pond.',
    hint: 'A warm desert by the pond, and something from the seaside in the water (a seashell or a treasure chest).',
    gift: { kind: 'outfit', item: 'pearls', done: 'Hector found a string of tiny pearls on his travels and left them for your critters. Find them in the wardrobe (tap a critter, then Dress up).' },
    lines: ['Nice warm sand!', 'Scuttle, scuttle.', 'This shell is getting a bit snug...', 'Sea air! Well, nearly.'],
  },
  tortoise: {
    name: 'Tobias',
    animal: 'tortoise',
    zone: 'desert',
    move: 'walk',
    when: 'day',
    speed: 5,
    cheer: 0.55,
    want: (w) => {
      const plants = plantsIn(w, 'desert', () => true);
      if (plants < 5) return 0;
      const rocks = decorIn(w, 'desert', (d) => d.def.stamp || d.def.shelter);
      return Math.min(1, plants / 9) * (rocks ? 1 : 0.5);
    },
    likes: 'A desert garden full of plants, with rocks to bask on.',
    hint: 'Lots of plants in the desert, and a rock or two. Comes by day.',
    gift: { kind: 'decor', decor: 'stoneDen', max: 1, ask: 'Hot days are hard on little ones. May I roll some stones into a cool, shady den for your desert critters?', done: 'Tobias rolled some stones into a cool, shady den in the desert.' },
    lines: ['Slowly does it.', 'Lovely warm sand.', 'In my day, we walked everywhere.', 'What a fine desert garden.'],
  },
};

export const VISITOR_ORDER = ['hedgehog', 'mole', 'robin', 'kingfisher', 'vole', 'crab', 'tortoise'];
for (const id of VISITOR_ORDER) VISITORS[id].id = id;

// What only a visitor can bring the farm (the first one, anyway: after
// that the keeper can plant or build more of them).
export const VISITOR_ONLY = { plant: ['lotus'], decor: ['leafPile', 'stoneDen'] };

// How long a visit lasts (game days), and the least time between visitors.
export const VISIT_DAYS = [0.3, 0.45];
export const VISIT_GAP = DAY_LEN * 0.6;
// A visitor's name and animal: "Hazel the hedgehog".
export function visitorName(id) {
  const v = VISITORS[id];
  return `${v.name} the ${v.animal}`;
}
