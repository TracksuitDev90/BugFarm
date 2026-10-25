// Plant catalog. `kind` selects the procedural shape; numbers tune ecology.
//   place: ground | shore | underwater | surface (lily pads root on the pond floor)
//   temp/moist: [deadly-low, comfy-low, comfy-high, deadly-high]
//   taste: what its flowers give the honey and seed heads ("clover honey",
//          "poppy seed heads"); the plant's name if not given
//   honey: the colour of honey made from its nectar
export const PLANTS = {
  daisy: { name: 'Daisy', zone: 'jungle', place: 'ground', kind: 'flower', h: 44, leaves: 4, petals: '#ffffff', center: '#f0bf45', petalShape: 'daisy', leaf: '#77b255', temp: [0, 10, 30, 40], moist: [0.06, 0.28, 1.01, 2], growDays: 2.2 , honey: '#f6d27a' },
  tulip: { name: 'Tulip', zone: 'jungle', place: 'ground', kind: 'flower', h: 38, leaves: 2, petals: '#e2553f', center: '#f6d64a', petalShape: 'tulip', leaf: '#6fae4a', basal: true, temp: [-2, 8, 26, 36], moist: [0.08, 0.3, 1.01, 2], growDays: 2.5 , honey: '#eec06a' },
  sunflower: { name: 'Sunflower', zone: 'jungle', place: 'ground', kind: 'flower', h: 96, leaves: 6, petals: '#f6c83a', center: '#7a4f2e', petalShape: 'sun', leaf: '#6fae4a', bigLeaf: true, temp: [4, 16, 34, 42], moist: [0.08, 0.25, 1.01, 2], growDays: 4 , honey: '#e0952a' },
  clover: { name: 'Clover', zone: 'jungle', place: 'ground', kind: 'clover', h: 14, leaves: 6, petals: '#f2b5c4', leaf: '#77b255', temp: [-2, 8, 30, 38], moist: [0.08, 0.3, 1.01, 2], growDays: 1.6, spreads: true , honey: '#f8e2a0' },
  fern: { name: 'Fern', zone: 'jungle', place: 'ground', kind: 'fern', h: 46, leaves: 5, leaf: '#5f9e45', temp: [2, 12, 28, 36], moist: [0.15, 0.45, 1.01, 2], growDays: 3, shade: true },
  grass: { name: 'Tall grass', zone: 'jungle', place: 'ground', kind: 'grass', h: 30, leaves: 7, leaf: '#8cc152', temp: [-2, 8, 34, 42], moist: [0.05, 0.2, 1.01, 2], growDays: 1.4, spreads: true },
  strawberry: { name: 'Strawberry plant', zone: 'jungle', place: 'ground', kind: 'strawberry', h: 20, leaves: 3, petals: '#ffffff', center: '#f0bf45', leaf: '#5f9e45', fruit: '#e2453f', temp: [0, 12, 30, 38], moist: [0.1, 0.35, 1.01, 2], growDays: 3 , taste: 'strawberry', honey: '#f0b070' },
  bigleaf: { name: 'Elephant ear', zone: 'jungle', place: 'ground', kind: 'bigleaf', h: 70, leaves: 3, leaf: '#4f8a3c', temp: [8, 18, 32, 40], moist: [0.2, 0.5, 1.01, 2], growDays: 4, shade: true },
  monstera: { name: 'Monstera', zone: 'jungle', place: 'ground', kind: 'monstera', h: 62, leaves: 4, leaf: '#3f8a3c', temp: [8, 20, 32, 40], moist: [0.22, 0.5, 1.01, 2], growDays: 4, shade: true },
  palm: { name: 'Parlour palm', zone: 'jungle', place: 'ground', kind: 'palm', h: 150, leaves: 7, leaf: '#4f9a3c', trunk: '#9a7650', temp: [8, 20, 34, 42], moist: [0.18, 0.45, 1.01, 2], growDays: 6, shade: true },
  bromeliad: { name: 'Bromeliad', zone: 'jungle', place: 'ground', kind: 'bromeliad', h: 30, leaves: 8, leaf: '#5f9e45', petals: '#e8475a', center: '#f6d64a', temp: [10, 18, 32, 40], moist: [0.2, 0.45, 1.01, 2], growDays: 3 , honey: '#e8a24a' },
  mushroom: { name: 'Toadstool', zone: 'jungle', place: 'ground', kind: 'mushroom', h: 22, leaves: 0, cap: '#e2453f', spots: '#ffffff', temp: [2, 10, 26, 34], moist: [0.3, 0.55, 1.01, 2], growDays: 1.2, likesDark: true, edibleCap: true },
  cactus: { name: 'Cactus', zone: 'desert', place: 'ground', kind: 'cactus', h: 52, leaves: 0, leaf: '#7aa35a', petals: '#f39ac0', center: '#f6d64a', temp: [4, 16, 42, 52], moist: [-1, 0, 0.45, 0.9], growDays: 5 , taste: 'cactus-flower', honey: '#d98a3a' },
  succulent: { name: 'Aloe', zone: 'desert', place: 'ground', kind: 'succulent', h: 22, leaves: 7, leaf: '#8fb87a', temp: [4, 14, 40, 50], moist: [-1, 0, 0.5, 0.95], growDays: 3 },
  marigold: { name: 'Desert marigold', zone: 'desert', place: 'ground', kind: 'flower', h: 28, leaves: 4, petals: '#f6c83a', center: '#e8803a', petalShape: 'daisy', leaf: '#9cb87a', branches: 3, temp: [2, 14, 40, 48], moist: [-1, 0.02, 0.6, 0.95], growDays: 2 , taste: 'marigold', honey: '#f0a630' },
  drygrass: { name: 'Desert grass', zone: 'desert', place: 'ground', kind: 'grass', h: 24, leaves: 6, leaf: '#c9b46a', temp: [0, 12, 42, 52], moist: [-1, 0, 0.6, 1.01], growDays: 1.5 },
  lilypad: { name: 'Water lily', zone: 'pond', place: 'surface', kind: 'lily', h: 0, leaves: 3, leaf: '#6fae4a', petals: '#f7c6da', center: '#f6d64a', temp: [4, 14, 32, 38], moist: [-1, -1, 2, 2], growDays: 2.5, aquatic: true , honey: '#f6e6b8' },
  reed: { name: 'Cattails', zone: 'pond', place: 'shore', kind: 'reed', h: 80, leaves: 5, leaf: '#8cb85a', head: '#7a4f2e', temp: [-2, 8, 34, 40], moist: [0.2, 0.5, 1.01, 2], growDays: 3 },
  eelgrass: { name: 'Eelgrass', zone: 'pond', place: 'underwater', kind: 'eelgrass', h: 90, leaves: 6, leaf: '#5f9e45', temp: [2, 10, 30, 36], moist: [-1, -1, 2, 2], growDays: 2.5, aquatic: true, oxygen: true },
  // newer flowers: each gives the bees a honey of its own
  lavender: { name: 'Lavender', zone: 'desert', place: 'ground', kind: 'flower', h: 40, leaves: 6, petals: '#9b7fd0', center: '#7d62b8', petalShape: 'spike', leaf: '#93ad86', branches: 3, temp: [0, 12, 38, 46], moist: [-1, 0.02, 0.55, 0.95], growDays: 2.6, honey: '#efe0b0' },
  poppy: { name: 'Desert poppy', zone: 'desert', place: 'ground', kind: 'flower', h: 30, leaves: 3, petals: '#f07a2c', center: '#3a2a1f', petalShape: 'cup', leaf: '#9cb87a', branches: 2, temp: [2, 14, 40, 48], moist: [-1, 0.02, 0.6, 0.95], growDays: 1.8, taste: 'poppy', honey: '#f2b04a' },
  cornflower: { name: 'Cornflower', zone: 'jungle', place: 'ground', kind: 'flower', h: 42, leaves: 4, petals: '#4f7fd8', center: '#2f3f8a', petalShape: 'ray', leaf: '#86ad6a', branches: 3, temp: [0, 10, 30, 38], moist: [0.06, 0.25, 1.01, 2], growDays: 2, honey: '#f4d98a' },
  bluebell: { name: 'Bluebell', zone: 'jungle', place: 'ground', kind: 'flower', h: 30, leaves: 3, basal: true, petals: '#7b86e0', center: '#f6f0d8', petalShape: 'bell', leaf: '#5f9e45', temp: [0, 8, 26, 34], moist: [0.15, 0.4, 1.01, 2], growDays: 2.2, honey: '#efd890' },
  orchid: { name: 'Orchid', zone: 'jungle', place: 'ground', kind: 'flower', h: 36, leaves: 3, basal: true, petals: '#e88ad6', center: '#f6d64a', petalShape: 'orchid', leaf: '#4f8a3c', branches: 2, temp: [12, 20, 32, 40], moist: [0.25, 0.5, 1.01, 2], growDays: 3.5, honey: '#f0c870' },
  hibiscus: { name: 'Hibiscus', zone: 'jungle', place: 'ground', kind: 'flower', h: 74, leaves: 6, bigLeaf: true, petals: '#e8475a', center: '#f6d64a', petalShape: 'trumpet', leaf: '#4f8a3c', branches: 3, temp: [10, 18, 34, 42], moist: [0.15, 0.4, 1.01, 2], growDays: 3.8, honey: '#d9822c' },
  iris: { name: 'Yellow iris', zone: 'pond', place: 'shore', kind: 'flower', h: 60, leaves: 4, basal: true, petals: '#f6c832', center: '#8a5a2c', petalShape: 'iris', leaf: '#6fae4a', temp: [-2, 8, 32, 40], moist: [0.2, 0.5, 1.01, 2], growDays: 2.6, taste: 'iris', honey: '#f6dc80' },
  // planted by Wilma the water vole when she visits: a lotus stands up out
  // of the water, and its blooms are worth picking like a water lily's
  lotus: { name: 'Lotus', zone: 'pond', place: 'surface', kind: 'lily', h: 0, leaves: 3, leaf: '#5f9e6a', petals: '#f9b8d0', center: '#f6d64a', temp: [10, 18, 34, 40], moist: [-1, -1, 2, 2], growDays: 3, aquatic: true, lotus: true, honey: '#f7e3b0' },
  // from Flora Petal at the Busytown Market: opens at night, glows softly,
  // and feeds the moths and fireflies; its seed heads count double
  moonflower: { name: 'Moonflower', zone: 'jungle', place: 'ground', kind: 'flower', h: 58, leaves: 5, petals: '#fbfaf2', center: '#f6e8a8', petalShape: 'moon', leaf: '#5f9e45', branches: 2, temp: [4, 14, 32, 40], moist: [0.1, 0.3, 1.01, 2], growDays: 2.4, night: true , honey: '#f2ecd0' },
  forgetmenot: { name: 'Forget-me-not', zone: 'any', place: 'ground', kind: 'flower', h: 18, leaves: 3, petals: '#8fc4f0', center: '#f6d64a', petalShape: 'daisy', leaf: '#77b255', branches: 3, temp: [-2, 6, 32, 42], moist: [-1, 0.05, 1.01, 2], growDays: 0.8, memorial: true },
};

export const PLANT_ORDER = ['daisy', 'tulip', 'sunflower', 'moonflower', 'cornflower', 'bluebell', 'orchid', 'hibiscus', 'clover', 'fern', 'grass', 'strawberry', 'bigleaf', 'monstera', 'palm', 'bromeliad', 'mushroom', 'cactus', 'succulent', 'marigold', 'poppy', 'lavender', 'drygrass', 'lilypad', 'lotus', 'reed', 'iris', 'eelgrass'];
for (const id of Object.keys(PLANTS)) PLANTS[id].id = id;

// Does it flower (and so give nectar, honey and seed heads)?
export function blooms(def) {
  return !def.memorial && (def.kind === 'flower' || def.kind === 'clover' || def.kind === 'strawberry' || def.kind === 'cactus' || def.kind === 'lily' || def.kind === 'bromeliad');
}
// The word for what its flowers taste of: "clover", "poppy".
export function tasteOf(def) {
  return def.taste || def.name.toLowerCase();
}
