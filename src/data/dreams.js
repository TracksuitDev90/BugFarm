// Every grown-up critter has a dream of its own: a little ambition that
// grows out of its job (a bee wants to visit thirty flowers, a koi to find
// lucky coins, a cricket to sing a hundred songs). It shows on the
// critter's card. When a dream comes true the critter becomes a master of
// its trade (it works a quarter faster from then on), wears a gold star,
// and Busytown sends a few coins to celebrate.
//   on:    the world event that counts toward it
//   who:   which critter in the event it counts for: 'c' (default), 'pred'
//          (whoever did the catching), 'by' (who collected), 'parents'
//          (both parents of a birth), 'all' (every one of the species)
//   test:  optional check on the event data
//   n:     how many it takes; title: what it's called once it comes true
const FAMILY = { id: 'family', text: 'Raise {n} families', on: 'birth', who: 'parents', n: 2, title: 'Proud parent' };
const FRIENDS = { id: 'friends', text: 'Make {n} friends', on: 'hello', n: 20, title: 'Life of the party' };

export const DREAMS = {
  ant: [
    { id: 'loads', text: 'Carry {n} loads of food home', on: 'antStore', n: 16, title: 'Champion forager' },
    { id: 'dig', text: 'Dig {n} bits of tunnel', on: 'antDig', n: 120, title: 'Master digger', count: (d) => d.n || 1 },
  ],
  cricket: [{ id: 'songs', text: 'Chirp {n} times in the night chorus', on: 'chirp', n: 1500, title: 'Star of the night chorus' }, FAMILY],
  grasshopper: [{ id: 'mow', text: 'Mow {n} mouthfuls of grass', on: 'eatPlant', test: (d) => d.tag === 'grass' || d.tag === 'leaf', n: 40, title: 'Head groundskeeper' }, FAMILY],
  gecko: [{ id: 'catch', text: 'Catch {n} snacks', on: 'predation', who: 'pred', n: 3, title: 'Night watch captain' }, { id: 'bask', text: 'Bask under the lamp {n} times', on: 'bask', n: 6, title: 'Sunbather' }],
  beetle: [{ id: 'compost', text: 'Roll {n} balls of compost', on: 'compost', n: 4, title: 'Master recycler' }, FAMILY],
  goldfish: [{ id: 'tag', text: 'Play {n} games of tag', on: 'tag', n: 3, title: 'Tag champion' }, FAMILY, FRIENDS],
  guppy: [{ id: 'flies', text: 'Snap up {n} flies', on: 'predation', who: 'pred', n: 2, title: 'Fly snapper' }, FAMILY],
  tetra: [FAMILY, { id: 'school', text: 'Swim with {n} school friends', on: 'hello', n: 40, title: 'Heart of the school' }],
  koi: [{ id: 'coins', text: 'Find {n} lucky coins', on: 'koiCoin', n: 3, title: 'Lucky koi' }, FRIENDS],
  puffer: [{ id: 'snails', text: 'Crunch {n} snails', on: 'predation', who: 'pred', n: 2, title: 'Snail sheriff' }, FAMILY],
  axolotl: [{ id: 'friends', text: 'Smile at {n} friends', on: 'hello', n: 20, title: 'Everyone\'s favourite' }],
  frog: [{ id: 'flies', text: 'Catch {n} flies', on: 'predation', who: 'pred', n: 4, title: 'Lightning tongue' }, { id: 'croak', text: 'Croak {n} times', on: 'croak', n: 80, title: 'Pond baritone' }],
  turtle: [{ id: 'bask', text: 'Bask on the rock {n} times', on: 'bask', n: 5, title: 'Sun-shell' }, FAMILY],
  pondsnail: [FAMILY],
  shrimp: [FAMILY, FRIENDS],
  dragonfly: [{ id: 'flies', text: 'Catch {n} flies on the wing', on: 'predation', who: 'pred', n: 3, title: 'Ace of the skies' }, { id: 'soar', text: 'Ride the warm air up {n} times', on: 'soar', n: 2, title: 'Sky sailor' }],
  courier: [{ id: 'post', text: 'Deliver {n} goods', on: 'collect', who: 'by', n: 25, title: 'Postmaster general' }],
  ladybug: [{ id: 'aphids', text: 'Eat {n} aphids', on: 'predation', who: 'pred', n: 5, title: 'Garden hero' }, FAMILY],
  aphid: [{ id: 'honeydew', text: 'Make honeydew for the ants {n} times', on: 'aphidFarm', who: 'aphid', n: 3, title: 'Sweetest aphid' }],
  butterfly: [
    { id: 'flowers', text: 'Sip from {n} flowers', on: 'pollinate', n: 20, title: 'Flower friend' },
    { id: 'dance', text: 'Dance up into the sky', on: 'dance', who: 'both', n: 1, title: 'Sky dancer' },
    { id: 'soar', text: 'Soar up a column of warm air', on: 'soar', n: 1, title: 'Sky sailor' },
  ],
  moth: [{ id: 'flowers', text: 'Visit {n} flowers by moonlight', on: 'pollinate', n: 12, title: 'Moonlight gardener' }, { id: 'lamp', text: 'Circle a light {n} times', on: 'mothLamp', n: 3, title: 'Lamp lover' }],
  snail: [FAMILY, { id: 'explore', text: 'Explore {n} new things', on: 'explore', n: 3, title: 'Slow explorer' }],
  bee: [{ id: 'flowers', text: 'Visit {n} flowers', on: 'pollinate', n: 30, title: 'Master pollinator' }, { id: 'honey', text: 'Help fill {n} jars of honey', on: 'honey', n: 2, title: 'Honey champion' }],
  worm: [{ id: 'castings', text: 'Make {n} heaps of castings', on: 'compost', n: 4, title: 'Soil wizard' }, { id: 'rain', text: 'Wiggle up in the rain', on: 'wormRain', n: 1, title: 'Rain dancer' }],
  firefly: [{ id: 'sync', text: 'Flash in time with friends {n} times', on: 'fireflySync', who: 'all', n: 2, title: 'Lamplighter in chief' }, { id: 'flowers', text: 'Visit {n} flowers by its own light', on: 'pollinate', n: 6, title: 'Night gardener' }],
  pillbug: [{ id: 'roll', text: 'Roll up into a ball {n} times', on: 'roll', n: 4, title: 'Roly-poly champion' }, FAMILY],
};

// The dreams a particular critter might have.
export function dreamsFor(c) {
  if (c.role === 'courier') return DREAMS.courier;
  return DREAMS[c.sp] || [];
}

export function dreamText(dr) {
  return dr.text.replace('{n}', dr.n);
}
