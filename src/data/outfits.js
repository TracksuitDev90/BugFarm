// Tiny things for the critters to wear. The keeper collects them (from
// the Busytown Market, where Tilly the tailor sells a whole sewing basket
// and every neighbour has a hat of their own trade, or as presents from
// visitors) and can dress any number of critters in each. Drawn by
// drawHat / drawNeckwear in art/ink.js.
//   neck:   worn round the neck rather than on the head
//   colour: the keeper picks its colour (otherwise it has its own)
//   from:   where it comes from, for the wardrobe's hints: a Market ware
//           id, or a visitor
export const OUTFITS = {
  beret: { name: 'Beret', colour: true, from: 'sewing' },
  cap: { name: 'Cap', colour: true, from: 'sewing' },
  beanie: { name: 'Bobble hat', colour: true, from: 'sewing' },
  sunhat: { name: 'Sun hat', colour: true, from: 'sewing' },
  bowler: { name: 'Bowler hat', colour: true, from: 'sewing' },
  bow: { name: 'Bow', colour: true, from: 'sewing' },
  flower: { name: 'Flower', from: 'sewing' },
  scarf: { name: 'Scarf', neck: true, colour: true, from: 'sewing' },
  bowtie: { name: 'Bow tie', neck: true, colour: true, from: 'sewing' },
  toque: { name: 'Chef\'s hat', from: 'hatToque' },
  party: { name: 'Party hat', colour: true, from: 'hatParty' },
  tophat: { name: 'Top hat', colour: true, from: 'hatTop' },
  mortar: { name: 'Mortarboard', colour: true, from: 'hatMortar' },
  mailcap: { name: 'Postie\'s cap', from: 'hatMail' },
  nurse: { name: 'Nurse\'s cap', from: 'hatNurse' },
  flowercrown: { name: 'Flower crown', colour: true, from: 'hatCrown' },
  straw: { name: 'Straw hat', colour: true, from: 'hatStraw' },
  bucket: { name: 'Bucket hat', colour: true, from: 'hatBucket' },
  hardhat: { name: 'Hard hat', from: 'hatHard' },
  propeller: { name: 'Propeller cap', colour: true, from: 'hatPropeller' },
  kerchief: { name: 'Headscarf', colour: true, from: 'hatKerchief' },
  feather: { name: 'Feather cap', visitor: 'kingfisher' },
  pearls: { name: 'Pearl necklace', neck: true, visitor: 'crab' },
};
export const OUTFIT_ORDER = Object.keys(OUTFITS);
for (const id of OUTFIT_ORDER) OUTFITS[id].id = id;

// Who can dress up: grown-ups whose pictures have somewhere to put a hat
// (worms wear hats but nothing round the neck: they haven't got one).
const WEARS = { cricket: 1, grasshopper: 1, gecko: 1, beetle: 1, goldfish: 1, frog: 1, turtle: 1, ladybug: 1, butterfly: 1, snail: 1, bee: 1, worm: 1, firefly: 1, pillbug: 1, koi: 1, axolotl: 1 };
const HATS_ONLY = { worm: 1, snail: 1, cricket: 1, grasshopper: 1 };
export function canWear(c, item) {
  if (!c || c.dead || !c.isAdult || c.role || !WEARS[c.sp]) return false;
  return !item || !OUTFITS[item] || !OUTFITS[item].neck || !HATS_ONLY[c.sp];
}
