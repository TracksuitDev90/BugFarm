// The Busytown Market. Every neighbour makes or sells something special,
// and offers it to the farm once the farm has helped them enough times
// (hearts: orders sent to them). The keeper pays in the coins Busytown
// sends back with every thank-you. These aren't trinkets: each one changes
// how the farm runs.
//   kind: perk   - a gadget or helper for the whole tank (world.perks)
//         decor  - a building that does a job (unlocks it in Decor and puts
//                  one in the tank)
//         critter / plant - unlocks something new to adopt or plant
//         stock  - a consumable that can be bought again and again
//         build  - makes a zone of the tank bigger, a step at a time (see
//                  sim/tank.js); each step (tier) needs the zone to have
//                  reached a level, and costs more
//         outfit - things for the critters to wear (items: outfit ids, see
//                  data/outfits.js), put in the wardrobe
//   hearts: friendship needed with `who` before they'll sell it
import { X, ZONE_X } from '../config.js';

export const WARES = [
  {
    id: 'courier',
    who: 'postie',
    kind: 'perk',
    name: 'Mail dragonfly',
    hearts: 1,
    cost: 30,
    what: 'Dash, a dragonfly in a postman\'s cap, zips round the tank all day collecting every finished good into your basket.',
    pitch: 'I\'ve trained a dragonfly to do my round. Want one for your farm?',
  },
  {
    id: 'rainBarrel',
    who: 'farmer',
    kind: 'perk',
    name: 'Rain barrel',
    hearts: 1,
    cost: 40,
    what: 'Catches the rain on the shed roof. The misters\' jugs refill themselves and the pond tops itself back up to its line.',
    pitch: 'A farm runs on rain. Let me fix you up with a barrel.',
  },
  {
    id: 'noticeBoard',
    who: 'mayor',
    kind: 'perk',
    name: 'Town notice board',
    hearts: 1,
    cost: 35,
    what: 'Your farm on the notice board in the town square: up to 5 letters at once, they arrive twice as often, and every order pays 2 extra coins.',
    pitch: 'Everyone in town should know about your farm!',
  },
  {
    id: 'sprinkler',
    who: 'gardener',
    kind: 'perk',
    name: 'Garden sprinklers',
    hearts: 1,
    cost: 45,
    what: 'Little brass sprinklers on the lid. Every plant grows twice as fast and flowers fill with nectar sooner: more food, more seeds, more honey.',
    pitch: 'My secret for prize-winning marrows. Shh!',
  },
  {
    id: 'moonflower',
    who: 'florist',
    kind: 'plant',
    plant: 'moonflower',
    name: 'Moonflower seeds',
    hearts: 1,
    cost: 30,
    what: 'Moonflowers open at night and glow softly. Moths and fireflies sip from them in the dark, and their seed heads count double on orders.',
    pitch: 'They only bloom by moonlight. Ever so romantic.',
  },
  {
    id: 'orchid',
    who: 'florist',
    kind: 'plant',
    plant: 'orchid',
    name: 'Orchid cuttings',
    hearts: 3,
    cost: 55,
    what: 'Exotic orchids for the jungle: frilly, spotted flowers that make the most delicate honey, and orchid seed heads florists can never get enough of.',
    pitch: 'My rarest flowers. I only part with them for my favourite customers.',
  },
  {
    id: 'buns',
    who: 'baker',
    kind: 'stock',
    name: 'Busy buns',
    hearts: 1,
    cost: 12,
    stock: 3,
    what: 'A bag of 3 sticky honey buns. Drop one in the tank: every critter who nibbles works double-time for half a day.',
    pitch: 'One bite and they\'re busy as bees. Fresh out of the oven!',
  },
  {
    id: 'koi',
    who: 'petshop',
    kind: 'critter',
    sp: 'koi',
    name: 'Koi',
    hearts: 1,
    cost: 40,
    what: 'Big, calm, beautifully patterned pond fish. Koi rummage in the gravel and now and then turn up a lost Busytown coin.',
    pitch: 'They\'re lucky, you know. Everyone says so.',
  },
  {
    id: 'clinic',
    who: 'doctor',
    kind: 'decor',
    decor: 'clinic',
    name: 'Critter clinic',
    hearts: 2,
    cost: 70,
    what: 'A little cottage hospital. Poorly or worn-out critters check in and come out well again, and every critter lives a third longer.',
    pitch: 'Prevention is better than cure, but a clinic helps with both.',
  },
  {
    id: 'butterflyHouse',
    who: 'tailor',
    kind: 'decor',
    decor: 'butterflyHouse',
    name: 'Butterfly house',
    hearts: 2,
    cost: 60,
    what: 'A silk-mesh butterfly house. Butterflies lay their eggs there, and rare butterflies (morphos, glasswings, peacocks) hatch from its chrysalises.',
    pitch: 'I sewed it from your own silk. It seemed only fair.',
  },
  {
    id: 'schoolhouse',
    who: 'school',
    kind: 'decor',
    decor: 'schoolhouse',
    name: 'Little schoolhouse',
    hearts: 2,
    cost: 65,
    what: 'Young critters learn quicker: eggs hatch and babies grow up twice as fast, and every grown-up\'s dream comes true sooner.',
    pitch: 'Every young mind deserves a good school. Even tiny ones!',
  },
  {
    id: 'hamper',
    who: 'chef',
    kind: 'decor',
    decor: 'hamper',
    name: 'Picnic hamper',
    hearts: 2,
    cost: 75,
    what: 'Hangs from the lid. At breakfast and supper it drops just the right snacks for whoever lives in its corner of the tank, never too much.',
    pitch: 'Le chef never lets anyone go hungry. Not even a beetle.',
  },
  {
    id: 'puffer',
    who: 'petshop',
    kind: 'critter',
    sp: 'puffer',
    name: 'Pea puffers',
    hearts: 2,
    cost: 45,
    what: 'Tiny round puffer fish that puff up when startled. They keep the pond snails from overrunning the pond.',
    pitch: 'Small, spiky and very, very cute.',
  },
  {
    id: 'climate',
    who: 'inventor',
    kind: 'perk',
    name: 'Clockwork climate keeper',
    hearts: 2,
    cost: 90,
    what: 'A brass contraption on the lid that turns every heat lamp, mister and the pond heater up and down to suit whoever lives below.',
    pitch: 'It thinks so you don\'t have to. Mostly.',
  },
  {
    id: 'axolotl',
    who: 'petshop',
    kind: 'critter',
    sp: 'axolotl',
    name: 'Axolotl',
    hearts: 3,
    cost: 90,
    what: 'A smiling pink axolotl with frilly gills. All of Busytown adores it: while one lives in your pond every order pays extra coins.',
    pitch: 'My very favourite. I only sell them to the best keepers.',
  },
  // ---- things for the critters to wear: Tilly's sewing basket, and a hat
  // of every trade in Busytown
  {
    id: 'sewing',
    who: 'tailor',
    kind: 'outfit',
    items: ['beret', 'cap', 'beanie', 'sunhat', 'bowler', 'bow', 'flower', 'scarf', 'bowtie'],
    name: 'Sewing basket',
    hearts: 1,
    cost: 25,
    what: 'Tilly sews tiny berets, caps, bobble hats, sun hats, bowlers, bows, flowers, scarves and bow ties, in any colour you like. Tap a critter, then Dress up.',
    pitch: 'Every critter deserves something nice to wear!',
  },
  { id: 'hatToque', who: 'chef', kind: 'outfit', items: ['toque'], name: 'Chef\'s hat', hearts: 1, cost: 15, what: 'A tall white chef\'s hat, just like Chef Crumble\'s.', pitch: 'Every good cook needs a proper hat!' },
  { id: 'hatParty', who: 'baker', kind: 'outfit', items: ['party'], name: 'Party hat', hearts: 1, cost: 12, what: 'A spotty party hat in any colour, for birthdays and every other day too.', pitch: 'Every day is cake day at my bakery!' },
  { id: 'hatTop', who: 'mayor', kind: 'outfit', items: ['tophat'], name: 'Top hat', hearts: 2, cost: 30, what: 'A very grand top hat with a ribbon in any colour. Simply splendid.', pitch: 'A top hat makes anyone look important. Ahem.' },
  { id: 'hatMortar', who: 'school', kind: 'outfit', items: ['mortar'], name: 'Mortarboard', hearts: 1, cost: 15, what: 'A mortarboard with a tassel: just the thing for a critter whose dream came true.', pitch: 'Top marks!' },
  { id: 'hatMail', who: 'postie', kind: 'outfit', items: ['mailcap'], name: 'Postie\'s cap', hearts: 1, cost: 12, what: 'A real postman\'s cap with a gold badge, just like Pip\'s.', pitch: 'Fancy joining the round?' },
  { id: 'hatNurse', who: 'doctor', kind: 'outfit', items: ['nurse'], name: 'Nurse\'s cap', hearts: 1, cost: 12, what: 'A crisp white nurse\'s cap with a red cross.', pitch: 'Keep calm and carry a thermometer.' },
  { id: 'hatCrown', who: 'florist', kind: 'outfit', items: ['flowercrown'], name: 'Flower crown', hearts: 2, cost: 20, what: 'A crown of tiny flowers in any colour. They never wilt!', pitch: 'Picked fresh this morning.' },
  { id: 'hatStraw', who: 'farmer', kind: 'outfit', items: ['straw'], name: 'Straw hat', hearts: 1, cost: 12, what: 'A farmer\'s straw hat with a ribbon in any colour and an ear of wheat.', pitch: 'Keeps the sun off while you work.' },
  { id: 'hatBucket', who: 'gardener', kind: 'outfit', items: ['bucket'], name: 'Bucket hat', hearts: 1, cost: 12, what: 'A floppy gardener\'s hat in any colour.', pitch: 'My lucky gardening hat. Well, one just like it.' },
  { id: 'hatHard', who: 'builder', kind: 'outfit', items: ['hardhat'], name: 'Hard hat', hearts: 1, cost: 12, what: 'A yellow builder\'s hard hat. Safety first!', pitch: 'Nobody steps on my building site without one.' },
  { id: 'hatPropeller', who: 'inventor', kind: 'outfit', items: ['propeller'], name: 'Propeller cap', hearts: 2, cost: 20, what: 'A cap in any colour with a real propeller on top. (It doesn\'t fly. Yet.)', pitch: 'My latest invention! It very nearly works.' },
  { id: 'hatKerchief', who: 'petshop', kind: 'outfit', items: ['kerchief'], name: 'Headscarf', hearts: 1, cost: 12, what: 'A spotty knotted headscarf in any colour, just like Odette\'s.', pitch: 'Everyone looks smart in spots.' },
  {
    id: 'buildDesert',
    who: 'builder',
    kind: 'build',
    zone: 'desert',
    name: 'Bigger desert',
    hearts: 0,
    tiers: [{ cost: 60, level: 2 }, { cost: 140, level: 3 }],
    what: 'Bertie moves the glass out and lays a stretch of fresh sand on the far side of the desert: room for more nests, plants and houses.',
    pitch: 'Running out of room? I can fix that.',
  },
  {
    id: 'buildPond',
    who: 'builder',
    kind: 'build',
    zone: 'pond',
    name: 'Bigger pond',
    hearts: 0,
    tiers: [{ cost: 70, level: 2 }, { cost: 160, level: 3 }],
    what: 'Bertie digs the pond wider down the middle, gravel, water and all: room for more fish, weeds and lilies.',
    pitch: 'A pond can always be a little bigger.',
  },
  {
    id: 'buildJungle',
    who: 'builder',
    kind: 'build',
    zone: 'jungle',
    name: 'Bigger jungle',
    hearts: 0,
    tiers: [{ cost: 60, level: 2 }, { cost: 140, level: 4 }],
    what: 'Bertie opens up more jungle floor on the far side, with more of the lid for vines to hang from.',
    pitch: 'Give those plants some elbow room!',
  },
];

export const WARE_BY_ID = {};
for (const w of WARES) WARE_BY_ID[w.id] = w;

// Things the Market sells that stay locked until bought:
// kind ('adopt' | 'plant' | 'decor') -> id -> ware id
export const MARKET_LOCK = { adopt: {}, plant: {}, decor: {} };
for (const w of WARES) {
  if (w.kind === 'critter') MARKET_LOCK.adopt[w.sp] = w.id;
  if (w.kind === 'plant') MARKET_LOCK.plant[w.plant] = w.id;
  if (w.kind === 'decor') MARKET_LOCK.decor[w.decor] = w.id;
}

// Where the gadgets sit on the tank's lid.
export const CLIMATE_X = X(880);
// two sprinkler heads over each garden, either side of its lamp and mister
// (however wide the zone has been built)
const inset = (z, k) => ZONE_X[z][0] + (ZONE_X[z][1] - ZONE_X[z][0]) * k;
export const SPRINKLER_X = [inset('desert', 0.18), inset('desert', 0.82), inset('jungle', 0.18), inset('jungle', 0.82)].map(Math.round);

// Coins Busytown pays for each thank-you star on an order.
export const COINS_PER_STAR = 5;
