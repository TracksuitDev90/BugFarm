// Decorations. Some are purely for looks; others do things:
//   shelter: critters hide/sleep inside (shade when hot, cosy when cold),
//     and can move in for good. cap: how many can call it home; fits: the
//     biggest critter that squeezes through; door: [x, y] of the way in
//     (from the bottom middle, before any flip); win: a window that lights
//     up when someone's home at night; chimney / spout: where smoke or
//     steam curls out. On dry land it houses land critters; sunk in the
//     pond it's a hidey-hole for the fish, shrimp and snails.
//   bubbles/oxygen: aerates the pond
//   light: glows at night
//   hive: lets bumblebees raise new bees
//   feeder: drops a little food into its zone every morning
//   job: what it's for, in a few words (shown on its card)
//   stamp: a rock that becomes part of the terrain
//   place: ground | floor (pond bottom, or ground) | top (hangs from the lid)
export const DECOR = {
  library: { name: 'Little library', place: 'ground', w: 46, h: 62, shelter: true, cap: 5, fits: 48, door: [-9, 0], win: [9, -18], chimney: [-11.5, -66], job: 'A home for 5. Bookworms who live here learn their jobs: they work a fifth faster.' },
  mushroomHouse: { name: 'Mushroom cottage', place: 'ground', w: 40, h: 56, shelter: true, cap: 3, fits: 36, door: [-2, 0], win: [7, -21], job: 'A cosy home for 3: somewhere to nap, hide from the midday heat and keep warm on cold nights.' },
  teapot: { name: 'Teapot house', place: 'ground', w: 50, h: 46, shelter: true, cap: 4, fits: 40, door: [2, 0], win: [-8, -16], spout: [32, -36], job: 'A home for 4, with a steaming spout on chilly evenings.' },
  boot: { name: 'Boot house', place: 'ground', w: 46, h: 52, shelter: true, cap: 4, fits: 40, door: [14, -2], win: [-9, -30], chimney: [-11.5, -60], job: 'A snug home for 4, with a smoking chimney on cold nights.' },
  appleHouse: { name: 'Apple house', place: 'ground', w: 42, h: 50, shelter: true, cap: 3, fits: 32, door: [-8, -1], win: [6, -26], job: 'A sweet-smelling home for 3.' },
  doughnutShop: { name: 'Doughnut shop', place: 'ground', w: 54, h: 54, shelter: true, cap: 4, fits: 48, door: [13, 0], win: [-8, -15], job: 'A home for 4 (it smells of doughnuts).' },
  log: { name: 'Hollow log', place: 'ground', w: 74, h: 30, shelter: true, cap: 5, fits: 50, door: [27, -2], job: 'A damp, dark home for 5. Pill bugs and snails love it.' },
  flowerpot: { name: 'Tipped flowerpot', place: 'ground', w: 46, h: 34, shelter: true, cap: 3, fits: 30, door: [14, -3], job: 'A shady home for 3, cool on hot days.' },
  beeHouse: { name: 'Bee hotel', place: 'ground', w: 30, h: 50, hive: true, job: 'Bees bring their pollen here to make honey and raise new bees.' },
  lampPost: { name: 'Lamp post', place: 'ground', w: 16, h: 72, light: true, job: 'Glows at night. Moths can\'t resist circling it.' },
  bench: { name: 'Park bench', place: 'ground', w: 42, h: 22, job: 'A good sit-down: critters who nap beside it wake up extra rested.' },
  fence: { name: 'Picket fence', place: 'ground', w: 60, h: 22, job: 'Crickets and grasshoppers sing from it, so the night chorus carries further and everyone sleeps sounder.' },
  sign: { name: 'Critter Farm sign', place: 'ground', w: 50, h: 42, job: 'Tells passers-by about your farm, so letters from Busytown come a little more often.' },
  mailbox: { name: 'Mailbox', place: 'ground', w: 18, h: 36, job: 'Somewhere for letters to wait: one more letter at a time, and its flag goes up when post comes.' },
  windmill: { name: 'Windmill', place: 'ground', w: 44, h: 76, animated: true, job: 'Catches the breeze and pumps a trickle of water, keeping its corner of the tank a little damper.' },
  bananaCar: { name: 'Banana car', place: 'ground', w: 60, h: 28, job: 'Smells so sweet that fruit flies buzz round it instead of your snacks: easy pickings for frogs and dragonflies.' },
  pickleCar: { name: 'Pickle car', place: 'ground', w: 54, h: 30, shelter: true, cap: 2, fits: 24, door: [-20, -6], win: [0, -23], job: 'A cosy back seat where 2 small critters can nap.' },
  farmStand: { name: 'Farm stand', place: 'ground', w: 56, h: 52, job: 'Each evening it sells up to three spare goods from your basket for coins.' },
  deliveryVan: { name: 'Delivery van', place: 'ground', w: 58, h: 42, job: 'Each morning it posts any order that\'s ready.' },
  castle: { name: 'Sand castle', place: 'floor', w: 60, h: 76, shelter: true, cap: 5, fits: 30, door: [0, -5], win: [0, -50], job: 'A hidey-hole for 5 pond critters. Fish doze in its towers.' },
  chest: { name: 'Treasure chest', place: 'floor', w: 38, h: 30, bubbles: 0.35, oxygen: 0.1, animated: true, shelter: true, cap: 2, fits: 18, door: [0, -12], job: 'Bubbles air into the pond, and 2 little critters can hide inside.' },
  diver: { name: 'Diver helmet', place: 'floor', w: 34, h: 38, bubbles: 0.5, oxygen: 0.15, shelter: true, cap: 2, fits: 28, door: [2, -19], job: 'Bubbles air into the pond, and 2 critters can hide inside.' },
  shell: { name: 'Big seashell', place: 'floor', w: 36, h: 24, shelter: true, cap: 3, fits: 16, door: [0, -3], job: 'A hidey-hole for 3 small pond critters.' },
  pipe: { name: 'Clay pipe', place: 'floor', w: 64, h: 24, shelter: true, cap: 4, fits: 30, door: [27, -10], job: 'A tunnel for 4 pond critters to hide in.' },
  bubbler: { name: 'Bubble stone', place: 'floor', w: 18, h: 8, bubbles: 1, oxygen: 0.5, job: 'Bubbles lots of air into the pond, so fish breathe easier on hot days.' },
  feeder: { name: 'Vacation feeder', place: 'top', w: 30, h: 32, feeder: true, job: 'Drops a little food into its corner every morning at 8: handy for holidays.' },
  // From the Busytown Market:
  //   clinic: poorly critters check in to get better
  //   butterflies: butterflies lay their eggs here, and rare ones hatch
  //   school: young critters grow up faster
  //   hamper: feeds its corner of the tank at breakfast and supper
  clinic: { name: 'Critter clinic', place: 'ground', w: 50, h: 58, shelter: true, cap: 4, fits: 40, door: [-8, 0], win: [10, -18], clinic: true, job: 'Poorly and worn-out critters check in to get well again. With a clinic, every critter lives a third longer.' },
  butterflyHouse: { name: 'Butterfly house', place: 'ground', w: 46, h: 60, butterflies: true, job: 'Butterflies lay their eggs here, and rare butterflies hatch from its chrysalises.' },
  schoolhouse: { name: 'Little schoolhouse', place: 'ground', w: 56, h: 72, shelter: true, cap: 4, fits: 36, door: [0, 0], win: [-16, -16], school: true, job: 'Young critters grow up twice as fast and dreams come true sooner. A home for 4, too.' },
  hamper: { name: 'Picnic hamper', place: 'top', w: 30, h: 28, hamper: true, job: 'Drops just the right snacks for its corner of the tank at breakfast and supper.' },
  // Built by visitors from the garden (see data/visitors.js), and then the
  // keeper's to place too:
  //   litter: drops a fallen leaf for the recyclers every morning
  leafPile: { name: 'Leaf pile', place: 'ground', w: 50, h: 24, shelter: true, cap: 4, fits: 24, door: [14, -2], litter: true, job: 'Raked up by Hazel the hedgehog: a cosy home for 4 small critters, and every morning a leaf drifts off it for the recyclers to munch.' },
  stoneDen: { name: 'Stone den', place: 'ground', w: 52, h: 32, shelter: true, cap: 4, fits: 40, door: [0, -1], job: 'Built by Tobias the tortoise: a cool, shady den where 4 desert critters can rest out of the midday heat.' },
  boulder: { name: 'Boulder', place: 'ground', w: 44, h: 26, stamp: { rx: 6, ry: 4 }, job: 'Becomes part of the ground: a hill to explore and dig under.' },
  pebble: { name: 'Pebble', place: 'ground', w: 20, h: 12, stamp: { rx: 3, ry: 2 }, job: 'Becomes part of the ground: a stepping stone.' },
  flatRock: { name: 'Basking rock', place: 'ground', w: 56, h: 18, stamp: { rx: 8, ry: 2.6 }, job: 'Becomes part of the ground: the best basking spot under a heat lamp.' },
};

export const DECOR_ORDER = Object.keys(DECOR);
for (const id of DECOR_ORDER) DECOR[id].id = id;
