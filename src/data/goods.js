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
    makers: ['bee', 'butterfly', 'moth', 'firefly'],
    how: 'Flowers visited by bees, butterflies, moths and fireflies ripen into seed heads, and harvester ants pile spare seeds by their door. Pick them, or leave them to sow themselves.',
    value: 1,
    batch: [2, 4],
    life: 1.2,
  },
  lily: {
    name: 'Water lilies',
    one: 'water lily',
    many: 'water lilies',
    makers: ['goldfish', 'tetra', 'koi', 'guppy', 'pondsnail', 'shrimp'],
    how: 'Water lilies bloom when the fish feed them and snails and shrimp keep the pond clear.',
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
    makers: ['butterfly', 'moth'],
    how: 'When a butterfly or moth hatches it leaves its empty chrysalis or cocoon behind, spun from fine silk.',
    value: 3,
    batch: [1, 1],
    life: 6,
  },
  honey: {
    name: 'Honey',
    one: 'jar of honey',
    many: 'jars of honey',
    makers: ['bee', 'ant'],
    how: 'Bees carry pollen home to the bee hotel and turn it into honey. Honeypot ants make desert honey too.',
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

// Every critter has a job, like everyone in Busytown, and every job does
// something real in the tank. `makes` is a good the job produces; `lines`
// are things it thinks about while on the lookout.
export const JOBS = {
  ant: { title: 'Builder & forager', does: 'digs the nest, fetches food for the colony and milks the aphids for honeydew. Their tunnels let air into the sand, so desert plants grow better' },
  harvester: { title: 'Seed harvester', does: 'carries seeds and grain home to the granary, and piles the spares by the nest door as seed heads for the basket', makes: 'seeds' },
  honeypot: { title: 'Living honey jar', does: 'stores nectar and honeydew in a swollen golden tummy; when the colony\'s store is full there\'s a jar of desert honey by the door', makes: 'honey' },
  cricket: { title: 'Night musician', does: 'sings the night chorus, and everyone in the tank sleeps sounder and wakes up rested on nights it plays', lines: ['Tuning up for tonight\'s lullaby.', 'Practising my chirps.'] },
  gecko: { title: 'Night watch', does: 'keeps the cricket and fruit fly numbers in check', lines: ['On patrol. All quiet.', 'Keeping an eye out for flies.'] },
  beetle: { title: 'Recycler', does: 'rolls leftovers and fallen leaves into balls of compost and buries them', makes: 'compost', lines: ['Sniffing out leftovers to recycle.', 'Any old leaves need tidying?'] },
  goldfish: { title: 'Lily gardener', does: 'feeds the water lilies (fish droppings are plant food!) so they bloom', makes: 'lily', lines: ['Checking on the lilies.', 'Doing the rounds of the pond.'] },
  guppy: { title: 'Surface skimmer', does: 'snaps up fruit flies that land on the water and nibbles floating flakes before they can sink and spoil', lines: ['Skimming the surface.', 'Any flies on the water?'] },
  tetra: { title: 'Lantern school', does: 'lights the pond at night with shining stripes and feeds the lilies like every fish does', makes: 'lily', lines: ['Keeping the school together.', 'Shimmer, shimmer.'] },
  koi: { title: 'Lucky rummager', does: 'feels about in the gravel with its whiskers, and now and then turns up a lost Busytown coin', lines: ['Rummaging in the gravel.', 'Something shiny down here?'] },
  puffer: { title: 'Snail patrol', does: 'crunches pond snails when there are too many, so they never overrun the pond', lines: ['Counting snails.', 'Hovering on patrol.'] },
  axolotl: { title: 'Busytown\'s favourite', does: 'smiles at everyone and tidies sunken leftovers. Busytown adores it so much that every order pays 3 extra coins', lines: ['Smiling at the fish.', 'Strolling along the bottom.'] },
  frog: { title: 'Fly catcher', does: 'snaps up fruit flies before they become a nuisance', lines: ['Watching for flies.', 'Any flies about?'] },
  turtle: { title: 'Pond tidier', does: 'munches leftover greens in the pond before they can spoil', lines: ['Patrolling for leftovers.', 'Keeping the pond shipshape.'] },
  pondsnail: { title: 'Glass scrubber', does: 'grazes algae off the glass and lily pads, which keeps the pond clear for the lilies', makes: 'lily', lines: ['Scrub scrub scrub.', 'Polishing the glass.'] },
  shrimp: { title: 'Gravel sweeper', does: 'picks leftovers out of the gravel before they can rot', makes: 'lily', lines: ['Sweeping the gravel.', 'Not a crumb left behind!'] },
  dragonfly: { title: 'Air patrol', does: 'hawks fruit flies out of the air on lightning-fast wings. Young nymphs hunt along the bottom of the pond', lines: ['Patrolling the skies.', 'Zoom!'] },
  courier: { title: 'Postman', does: 'zips round the tank collecting every finished good into the keeper\'s basket', lines: ['Collecting the post!', 'Special delivery!'] },
  ladybug: { title: 'Plant guard', does: 'patrols the plants and eats the aphids that tire them out', lines: ['Patrolling the leaves.', 'Any aphids on my patch?'] },
  aphid: { title: 'Honeydew maker', does: 'sips plant sap and makes sweet honeydew for the ants' },
  butterfly: { title: 'Flower visitor', does: 'pollinates flowers so they set seed, and leaves a silk chrysalis behind when it hatches', makes: 'silk', lines: ['Which flower next?', 'So many flowers to visit!'] },
  moth: { title: 'Night pollinator', does: 'visits flowers after dark so they set seed round the clock, and leaves a silk cocoon behind when it hatches', makes: 'silk', lines: ['Is that a lamp? Ooh!', 'Flowers taste sweeter by moonlight.'] },
  snail: { title: 'Leaf tidier', does: 'munches old leaves and mushrooms, tidying the jungle floor', lines: ['Slowly tidying the jungle floor.', 'Mmm, I smell old leaves.'] },
  bee: { title: 'Honey maker', does: 'pollinates flowers and carries pollen home to the bee hotel to make honey', makes: 'honey', lines: ['Looking for flowers.', 'Busy busy!'] },
  worm: { title: 'Soil maker', does: 'tunnels through the soil turning old leaves into rich castings', makes: 'compost' },
  firefly: { title: 'Lamplighter', does: 'lights up the jungle after dark, sipping nectar and pollinating flowers by its own light', lines: ['Waiting for dusk to light up.', 'Saving my glow for tonight.'] },
  pillbug: { title: 'Leaf recycler', does: 'munches fallen leaves and turns them back into soil', lines: ['Hunting for fallen leaves.', 'Recycling day!'] },
  grasshopper: { title: 'Lawn mower', does: 'trims the grass so it doesn\'t take over, and the clippings fall as leaf litter for the recyclers', lines: ['This grass needs a trim.', 'Mowing the lawn!'] },
  fruitfly: { title: 'Uninvited guest', does: 'turns up wherever fruit is left to rot, and feeds the frogs, fish and dragonflies' },
};

// The job a particular critter does (a colony's kind, or a special role,
// can give it a different one from the rest of its species).
export function jobOf(c, col) {
  if (c.role === 'courier') return JOBS.courier;
  if (c.sp === 'ant' && col && col.kind && col.kind !== 'garden' && JOBS[col.kind]) return JOBS[col.kind];
  return JOBS[c.sp];
}
