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
//   hearts: friendship needed with `who` before they'll sell it
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
export const CLIMATE_X = 880;
export const SPRINKLER_X = [150, 460, 1150, 1470];

// Coins Busytown pays for each thank-you star on an order.
export const COINS_PER_STAR = 4;
