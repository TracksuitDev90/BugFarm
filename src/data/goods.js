// Goods the farm makes. Critters make them by doing their jobs, the keeper
// collects them from the tank, and Busytown's neighbours send for them.
// Goods left in the tank still do good: seeds sow themselves, compost
// melts into the soil.
//   value: thank-you stars each one earns on an order
//   batch: [min, max] a neighbour usually asks for
//   life:  game days a good waits in the tank before it fades (or sows)
export const GOODS = {
  seeds: {
    name: 'Seeds',
    one: 'seed head',
    many: 'seed heads',
    makers: ['bee', 'butterfly'],
    how: 'Flowers visited by bees and butterflies ripen into seed heads. Pick them, or leave them to sow themselves.',
    value: 1,
    batch: [2, 4],
    life: 1.2,
  },
  lily: {
    name: 'Water lilies',
    one: 'water lily',
    many: 'water lilies',
    makers: ['goldfish', 'pondsnail', 'shrimp'],
    how: 'Water lilies bloom when goldfish feed them and snails and shrimp keep the pond clear.',
    value: 2,
    batch: [1, 2],
    life: 2,
  },
  compost: {
    name: 'Compost',
    one: 'ball of compost',
    many: 'balls of compost',
    makers: ['beetle', 'worm'],
    how: 'Beetles roll leftovers and fallen leaves into balls and bury them. Worms turn old leaves into crumbly castings.',
    value: 1,
    batch: [2, 3],
    life: 2.5,
  },
  silk: {
    name: 'Silk',
    one: 'silk chrysalis',
    many: 'silk chrysalises',
    makers: ['butterfly'],
    how: 'When a butterfly hatches it leaves its empty chrysalis behind, spun from fine silk.',
    value: 3,
    batch: [1, 1],
    life: 6,
  },
  honey: {
    name: 'Honey',
    one: 'jar of honey',
    many: 'jars of honey',
    makers: ['bee'],
    how: 'Bees carry pollen home to the bee hotel and turn it into honey.',
    value: 2,
    batch: [1, 2],
    life: 30,
  },
};

export const GOOD_ORDER = ['seeds', 'lily', 'compost', 'silk', 'honey'];
for (const id of GOOD_ORDER) GOODS[id].id = id;

export function goodWord(id, n) {
  const g = GOODS[id];
  return `${n} ${n === 1 ? g.one : g.many}`;
}

// Every critter has a job, like everyone in Busytown. `makes` is a good the
// job produces; `lines` are things it thinks about while on the lookout.
export const JOBS = {
  ant: { title: 'Builder & forager', does: 'digs the nest, fetches food for the colony and milks the aphids for honeydew' },
  cricket: { title: 'Night musician', does: 'sings the night chorus — the warmer it is, the faster the song', lines: ['Tuning up for tonight\'s concert.', 'Practising my chirps.'] },
  gecko: { title: 'Night watch', does: 'keeps the cricket and fruit fly numbers in check', lines: ['On patrol. All quiet.', 'Keeping an eye out for flies.'] },
  beetle: { title: 'Recycler', does: 'rolls leftovers and fallen leaves into balls of compost and buries them', makes: 'compost', lines: ['Sniffing out leftovers to recycle.', 'Any old leaves need tidying?'] },
  goldfish: { title: 'Lily gardener', does: 'feeds the water lilies (fish droppings are plant food!) so they bloom', makes: 'lily', lines: ['Checking on the lilies.', 'Doing the rounds of the pond.'] },
  frog: { title: 'Fly catcher', does: 'snaps up fruit flies before they become a nuisance', lines: ['Watching for flies.', 'Any flies about?'] },
  turtle: { title: 'Pond tidier', does: 'munches leftover greens in the pond before they can spoil', lines: ['Patrolling for leftovers.', 'Keeping the pond shipshape.'] },
  pondsnail: { title: 'Glass scrubber', does: 'grazes algae off the glass and lily pads, which keeps the pond clear for the lilies', makes: 'lily', lines: ['Scrub scrub scrub.', 'Polishing the glass.'] },
  shrimp: { title: 'Gravel sweeper', does: 'picks leftovers out of the gravel before they can rot', makes: 'lily', lines: ['Sweeping the gravel.', 'Not a crumb left behind!'] },
  ladybug: { title: 'Plant guard', does: 'patrols the plants and eats the aphids that tire them out', lines: ['Patrolling the leaves.', 'Any aphids on my patch?'] },
  aphid: { title: 'Honeydew maker', does: 'sips plant sap and makes sweet honeydew for the ants' },
  butterfly: { title: 'Flower visitor', does: 'pollinates flowers so they set seed, and leaves a silk chrysalis behind when it hatches', makes: 'silk', lines: ['Which flower next?', 'So many flowers to visit!'] },
  snail: { title: 'Leaf tidier', does: 'munches old leaves and mushrooms, tidying the jungle floor', lines: ['Slowly tidying the jungle floor.', 'Mmm, I smell old leaves.'] },
  bee: { title: 'Honey maker', does: 'pollinates flowers and carries pollen home to the bee hotel to make honey', makes: 'honey', lines: ['Looking for flowers.', 'Busy busy!'] },
  worm: { title: 'Soil maker', does: 'tunnels through the soil turning old leaves into rich castings', makes: 'compost' },
  firefly: { title: 'Lamplighter', does: 'lights up the jungle after dark', lines: ['Waiting for dusk to light up.', 'Saving my glow for tonight.'] },
  pillbug: { title: 'Leaf recycler', does: 'munches fallen leaves and turns them back into soil', lines: ['Hunting for fallen leaves.', 'Recycling day!'] },
  grasshopper: { title: 'Lawn mower', does: 'trims the grass so it doesn\'t take over', lines: ['This grass needs a trim.', 'Mowing the lawn!'] },
  fruitfly: { title: 'Uninvited guest', does: 'turns up wherever fruit is left to rot' },
};
