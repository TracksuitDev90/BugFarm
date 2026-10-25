// How each zone of the farm grows. Every zone starts with two kinds of
// critter; reaching a level unlocks more critters, snacks, plants and
// decorations. A level's goals are what the keeper does to reach the next
// one, and they double as a gentle tutorial for that zone.
//
// Goal kinds:
//   event:  count world events (on), optionally only in this zone (inZone),
//           for some species (sp) or passing a test; n = how many
//   comfy:  keep the zone's climate comfy for its residents for `hours`
//   check:  a number read from the world (value) reaching n
//   tip:    a nudge shown under the goal on the clipboard
// Most levels mix looking after the zone with something its critters make,
// so growing the farm is about what the farm does, not just keeping it.
export const ZONE_PLAN = {
  desert: [
    {
      critters: ['ant', 'cricket'],
      foods: ['seedmix', 'apple', 'oats'],
      plants: ['cactus', 'drygrass'],
      goals: [
        { id: 'd1feed', text: 'Drop 3 snacks in the desert', kind: 'event', on: 'feed', inZone: true, n: 3 },
        { id: 'd1comfy', text: 'Keep the desert comfy for 6 hours', kind: 'comfy', hours: 6 },
        { id: 'd1dig', text: 'Let the ants dig 30 bits of tunnel', kind: 'check', value: (w) => w.colonies.reduce((a, c) => a + c.dug, 0), n: 30 },
      ],
    },
    {
      critters: ['beetle', 'harvesterAnt'],
      foods: ['corn', 'sunflower', 'carrot', 'pumpkin'],
      plants: ['succulent', 'marigold', 'poppy'],
      decor: ['flatRock'],
      goals: [
        { id: 'd2born', text: 'Baby crickets or beetles hatch', kind: 'event', on: 'birth', sp: ['cricket', 'beetle'], n: 1, tip: 'Well-fed, comfy grown-ups have babies.' },
        { id: 'd2ants', text: 'Grow the ant colony to 14 ants', kind: 'check', value: (w) => w.count('ant'), n: 14, tip: 'Ants love seeds and sweet things near their nest.' },
        { id: 'd2compost', text: 'Beetles roll 2 balls of compost', kind: 'event', on: 'compost', sp: ['beetle'], n: 2, tip: 'Beetles recycle leftovers and fallen leaves. Adopt a pair if you have none.' },
      ],
    },
    {
      critters: ['gecko', 'honeypotAnt'],
      foods: ['bugbites', 'banana', 'cookie', 'grape'],
      plants: ['lavender'],
      decor: ['feeder'],
    },
  ],
  pond: [
    {
      critters: ['goldfish', 'pondsnail'],
      foods: ['flakes', 'algae', 'cucumber'],
      plants: ['reed', 'lilypad'],
      goals: [
        { id: 'p1feed', text: 'Feed the pond 3 times', kind: 'event', on: 'feed', inZone: true, n: 3 },
        { id: 'p1comfy', text: 'Keep the pond comfy and fresh for 6 hours', kind: 'comfy', hours: 6 },
        { id: 'p1clean', text: 'Give the pond a clean (Climate › Clean pond)', kind: 'event', on: 'chore', test: (d) => d.kind === 'pond', n: 1, tip: 'Leftover food spoils and clouds the water.' },
        { id: 'p1lily', text: 'Pick a water lily in bloom', kind: 'event', on: 'collect', test: (d) => d.type === 'lily', n: 1, tip: 'Goldfish feed the lilies and snails keep the water clear. Tap a bloom to pick it.' },
      ],
    },
    {
      critters: ['shrimp', 'guppy'],
      foods: ['pellets', 'pea', 'bread'],
      plants: ['eelgrass', 'iris'],
      decor: ['bubbler'],
      goals: [
        { id: 'p2grass', text: 'Plant eelgrass to freshen the water', kind: 'event', on: 'plant', test: (d) => d.plant.type === 'eelgrass', n: 1, tip: 'Water plants add air to the pond.' },
        { id: 'p2born', text: 'Baby fish, snails or shrimp arrive', kind: 'event', on: 'birth', sp: ['goldfish', 'pondsnail', 'shrimp'], n: 1, tip: 'Comfy, well-fed pond critters breed.' },
        { id: 'p2order', text: 'Send an order to Busytown', kind: 'event', on: 'delivered', n: 1, tip: 'Letters arrive on the clipboard\'s Orders tab.' },
      ],
    },
    {
      critters: ['frog', 'tetra'],
      foods: ['spinach', 'broccoli'],
      decor: ['castle'],
      goals: [
        { id: 'p3frog', text: 'A tadpole grows into a frog', kind: 'event', on: 'metamorph', test: (d) => d.kind === 'frog', n: 1, tip: 'Adopt tadpoles; warm water helps them grow.' },
        { id: 'p3rinse', text: 'Rinse out the pond filter', kind: 'event', on: 'chore', test: (d) => d.kind === 'rinse', n: 1, tip: 'Tap the filter: its sponge turns brown as it clogs.' },
        { id: 'p3orders', text: 'Send 3 orders to Busytown', kind: 'event', on: 'delivered', n: 3, tip: 'Every good the critters make can go on an order.' },
      ],
    },
    {
      critters: ['turtle', 'dragonfly'],
      foods: ['sticks', 'tomato'],
    },
  ],
  jungle: [
    {
      critters: ['snail', 'butterfly'],
      foods: ['lettuce', 'sugarwater', 'strawberry'],
      plants: ['grass', 'fern', 'daisy', 'monstera'],
      goals: [
        { id: 'j1feed', text: 'Drop 3 snacks in the jungle', kind: 'event', on: 'feed', inZone: true, n: 3 },
        { id: 'j1comfy', text: 'Keep the jungle warm and damp for 6 hours', kind: 'comfy', hours: 6 },
        { id: 'j1plant', text: 'Plant something new in the jungle', kind: 'event', on: 'plant', inZone: true, n: 1 },
        { id: 'j1seeds', text: 'Pick 2 seed heads from the flowers', kind: 'event', on: 'collect', test: (d) => d.type === 'seeds', n: 2, tip: 'Butterflies pollinate flowers, which ripen into seed heads that sparkle.' },
      ],
    },
    {
      critters: ['worm', 'pillbug'],
      foods: ['kale', 'mushroom', 'eggshell', 'leaves'],
      plants: ['mushroom', 'bigleaf', 'clover', 'palm', 'cornflower'],
      decor: ['library'],
      goals: [
        { id: 'j2pupa', text: 'A caterpillar wraps up in a chrysalis', kind: 'event', on: 'pupate', n: 1, tip: 'Caterpillars need leafy plants. No caterpillars? Adopt one.' },
        { id: 'j2refill', text: "Refill the jungle mister's water jug", kind: 'event', on: 'chore', test: (d) => d.kind === 'refill' && d.zone === 'jungle', n: 1, tip: "Tap the mister's water jug and press Refill." },
        { id: 'j2silk', text: 'Collect the silk from an empty chrysalis', kind: 'event', on: 'collect', test: (d) => d.type === 'silk', n: 1, tip: 'When a butterfly hatches it leaves its silk chrysalis behind.' },
      ],
    },
    {
      critters: ['aphid', 'ladybug', 'moth'],
      foods: ['honey', 'pollen'],
      plants: ['tulip', 'strawberry', 'bromeliad', 'bluebell'],
      goals: [
        { id: 'j3lady', text: 'A ladybug snacks on an aphid', kind: 'event', on: 'predation', test: (d) => d.pred.sp === 'ladybug', n: 1, tip: 'Aphids live on leafy plants; ladybugs come hunting.' },
        { id: 'j3born', text: 'Baby snails, worms or pill bugs arrive', kind: 'event', on: 'birth', sp: ['snail', 'worm', 'pillbug'], n: 1, tip: 'They breed when damp, comfy and well fed.' },
        { id: 'j3compost', text: 'Worms make 2 heaps of compost', kind: 'event', on: 'compost', sp: ['worm'], n: 2, tip: 'Worms turn fallen leaves into castings. They like damp soil.' },
      ],
    },
    {
      critters: ['bee'],
      foods: ['blueberry', 'orange', 'jelly'],
      plants: ['sunflower'],
      decor: ['beeHouse'],
      goals: [
        { id: 'j4pollen', text: 'Bees pollinate 6 flowers', kind: 'event', on: 'pollinate', n: 6, tip: 'Bees need flowers, and their bee hotel to raise young.' },
        { id: 'j4sprout', text: 'A seed sprouts into a new plant', kind: 'event', on: 'sprout', n: 1, tip: 'Pollinated flowers drop seeds.' },
        { id: 'j4honey', text: 'Bees fill a jar of honey', kind: 'event', on: 'honey', n: 1, tip: 'Bees carry pollen home to the bee hotel.' },
      ],
    },
    {
      critters: ['firefly', 'grasshopper'],
      foods: ['melon', 'watermelon', 'pear', 'doughnut', 'cheese'],
      plants: ['hibiscus'],
      decor: ['lampPost'],
    },
  ],
};

// item kind -> id -> { zone, level } for everything a level unlocks
export const UNLOCK_AT = { adopt: {}, feed: {}, plant: {}, decor: {} };
const KIND_KEY = { adopt: 'critters', feed: 'foods', plant: 'plants', decor: 'decor' };
for (const z of Object.keys(ZONE_PLAN)) {
  ZONE_PLAN[z].forEach((lv, i) => {
    for (const kind of Object.keys(KIND_KEY)) for (const id of lv[KIND_KEY[kind]] || []) UNLOCK_AT[kind][id] = { zone: z, level: i + 1 };
  });
}
export function maxLevel(z) {
  return ZONE_PLAN[z].length;
}
export { KIND_KEY };
