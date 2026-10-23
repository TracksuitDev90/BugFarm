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
//   stamp: a rock that becomes part of the terrain
//   place: ground | floor (pond bottom, or ground) | top (hangs from the lid)
export const DECOR = {
  library: { name: 'Little library', place: 'ground', w: 46, h: 62, shelter: true, cap: 5, fits: 48, door: [-9, 0], win: [9, -18], chimney: [-11.5, -66] },
  mushroomHouse: { name: 'Mushroom cottage', place: 'ground', w: 40, h: 56, shelter: true, cap: 3, fits: 36, door: [-2, 0], win: [7, -21] },
  teapot: { name: 'Teapot house', place: 'ground', w: 50, h: 46, shelter: true, cap: 4, fits: 40, door: [2, 0], win: [-8, -16], spout: [32, -36] },
  boot: { name: 'Boot house', place: 'ground', w: 46, h: 52, shelter: true, cap: 4, fits: 40, door: [14, -2], win: [-9, -30], chimney: [-11.5, -60] },
  appleHouse: { name: 'Apple house', place: 'ground', w: 42, h: 50, shelter: true, cap: 3, fits: 32, door: [-8, -1], win: [6, -26] },
  doughnutShop: { name: 'Doughnut shop', place: 'ground', w: 54, h: 54, shelter: true, cap: 4, fits: 48, door: [13, 0], win: [-8, -15] },
  log: { name: 'Hollow log', place: 'ground', w: 74, h: 30, shelter: true, cap: 5, fits: 50, door: [27, -2] },
  flowerpot: { name: 'Tipped flowerpot', place: 'ground', w: 46, h: 34, shelter: true, cap: 3, fits: 30, door: [14, -3] },
  beeHouse: { name: 'Bee hotel', place: 'ground', w: 30, h: 50, hive: true },
  lampPost: { name: 'Lamp post', place: 'ground', w: 16, h: 72, light: true },
  bench: { name: 'Park bench', place: 'ground', w: 42, h: 22 },
  fence: { name: 'Picket fence', place: 'ground', w: 60, h: 22 },
  sign: { name: 'Bug Farm sign', place: 'ground', w: 50, h: 42 },
  mailbox: { name: 'Mailbox', place: 'ground', w: 18, h: 36 },
  windmill: { name: 'Windmill', place: 'ground', w: 44, h: 76, animated: true },
  bananaCar: { name: 'Banana car', place: 'ground', w: 60, h: 28 },
  pickleCar: { name: 'Pickle car', place: 'ground', w: 54, h: 30 },
  farmStand: { name: 'Farm stand', place: 'ground', w: 56, h: 52 },
  deliveryVan: { name: 'Delivery van', place: 'ground', w: 58, h: 42 },
  castle: { name: 'Sand castle', place: 'floor', w: 60, h: 76, shelter: true, cap: 5, fits: 30, door: [0, -5], win: [0, -50] },
  chest: { name: 'Treasure chest', place: 'floor', w: 38, h: 30, bubbles: 0.35, oxygen: 0.1, animated: true, shelter: true, cap: 2, fits: 18, door: [0, -12] },
  diver: { name: 'Diver helmet', place: 'floor', w: 34, h: 38, bubbles: 0.5, oxygen: 0.15, shelter: true, cap: 2, fits: 28, door: [2, -19] },
  shell: { name: 'Big seashell', place: 'floor', w: 36, h: 24, shelter: true, cap: 3, fits: 16, door: [0, -3] },
  pipe: { name: 'Clay pipe', place: 'floor', w: 64, h: 24, shelter: true, cap: 4, fits: 30, door: [27, -10] },
  bubbler: { name: 'Bubble stone', place: 'floor', w: 18, h: 8, bubbles: 1, oxygen: 0.5 },
  feeder: { name: 'Vacation feeder', place: 'top', w: 30, h: 32, feeder: true },
  boulder: { name: 'Boulder', place: 'ground', w: 44, h: 26, stamp: { rx: 6, ry: 4 } },
  pebble: { name: 'Pebble', place: 'ground', w: 20, h: 12, stamp: { rx: 3, ry: 2 } },
  flatRock: { name: 'Basking rock', place: 'ground', w: 56, h: 18, stamp: { rx: 8, ry: 2.6 } },
};

export const DECOR_ORDER = Object.keys(DECOR);
for (const id of DECOR_ORDER) DECOR[id].id = id;
