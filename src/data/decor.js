// Decorations. Some are purely for looks; others do things:
//   shelter: critters hide/sleep inside (shade when hot, cosy when cold)
//   bubbles/oxygen: aerates the pond
//   light: glows at night
//   hive: lets bumblebees raise new bees
//   feeder: drops a little food into its zone every morning
//   stamp: a rock that becomes part of the terrain
//   place: ground | floor (pond bottom, or ground) | top (hangs from the lid)
export const DECOR = {
  library: { name: 'Little library', place: 'ground', w: 46, h: 62, shelter: true },
  mushroomHouse: { name: 'Mushroom cottage', place: 'ground', w: 40, h: 56, shelter: true },
  teapot: { name: 'Teapot house', place: 'ground', w: 50, h: 46, shelter: true },
  boot: { name: 'Boot house', place: 'ground', w: 46, h: 52, shelter: true },
  appleHouse: { name: 'Apple house', place: 'ground', w: 42, h: 50, shelter: true },
  doughnutShop: { name: 'Doughnut shop', place: 'ground', w: 54, h: 54, shelter: true },
  log: { name: 'Hollow log', place: 'ground', w: 74, h: 30, shelter: true },
  flowerpot: { name: 'Tipped flowerpot', place: 'ground', w: 46, h: 34, shelter: true },
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
  castle: { name: 'Sand castle', place: 'floor', w: 60, h: 76, shelter: true },
  chest: { name: 'Treasure chest', place: 'floor', w: 38, h: 30, bubbles: 0.35, oxygen: 0.1, animated: true },
  diver: { name: 'Diver helmet', place: 'floor', w: 34, h: 38, bubbles: 0.5, oxygen: 0.15 },
  shell: { name: 'Big seashell', place: 'floor', w: 36, h: 24, shelter: true },
  bubbler: { name: 'Bubble stone', place: 'floor', w: 18, h: 8, bubbles: 1, oxygen: 0.5 },
  feeder: { name: 'Vacation feeder', place: 'top', w: 30, h: 32, feeder: true },
  boulder: { name: 'Boulder', place: 'ground', w: 44, h: 26, stamp: { rx: 6, ry: 4 } },
  pebble: { name: 'Pebble', place: 'ground', w: 20, h: 12, stamp: { rx: 3, ry: 2 } },
  flatRock: { name: 'Basking rock', place: 'ground', w: 56, h: 18, stamp: { rx: 8, ry: 2.6 } },
};

export const DECOR_ORDER = Object.keys(DECOR);
for (const id of DECOR_ORDER) DECOR[id].id = id;
