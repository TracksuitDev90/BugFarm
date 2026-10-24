// The neighbours in Busytown who write to the farm for its goods. Each has
// a job, the goods they need for it and a few reasons why, so the letters
// read like they come from real busy people. Every neighbour also has one
// special thing they make or sell (see data/market.js), which they offer
// the farm once it's helped them enough times.
//   wants: good -> how much they like asking for it
//   why:   good -> reasons ({n} is filled in with what they ask for)
//   look:  how their portrait is drawn (see art/townsfolk.js)
//   thanks: what they say when an order arrives
export const NEIGHBOURS = [
  {
    id: 'baker',
    name: 'Baker Bramble',
    job: 'the baker',
    icon: 'food',
    wants: { honey: 3, seeds: 2 },
    why: {
      honey: ['I\'m baking honey buns for the Busytown fair!', 'My famous honey cake needs {n}.'],
      seeds: ['Seedy loaves are the talk of the town.', 'I sprinkle seeds on every bun.'],
    },
    thanks: ['The buns are in the oven already!', 'Mmm, smell that. Fresh from your farm!'],
    look: { animal: 'bear', fur: '#b07a4a', face: '#ecd2a4', inner: '#e8a98a', nose: '#3a2a1f', bg: '#f6dfa8', hat: 'bakercap', outfit: { kind: 'apron', color: '#f0bf45', trim: '#fffdf6' }, extras: ['flour', 'neckerchief'], kerchief: '#d9483b' },
  },
  {
    id: 'tailor',
    name: 'Tilly Thimble',
    job: 'the tailor',
    icon: 'heart',
    wants: { silk: 4, lily: 1 },
    why: {
      silk: ['I\'m sewing a wedding veil and only real silk will do.', 'The mayor wants a silk scarf for the parade.'],
      lily: ['A lily is just the thing to finish a bonnet.'],
    },
    thanks: ['Such fine silk! Your butterflies are true artists.', 'I can sew something wonderful with this.'],
    look: { animal: 'cat', fur: '#a9adb5', face: '#f4efe6', inner: '#f2b5c4', nose: '#e57a8a', spots: 'stripes', spotColor: '#6b6f78', bg: '#e6d4f2', outfit: { kind: 'dress', color: '#8d6cc0', trim: '#fffdf6', dots: 'rgba(255,253,246,0.7)' }, extras: ['glasses', 'tape'], hat: 'bow', hatColor: '#e57a8a' },
  },
  {
    id: 'gardener',
    name: 'Gus Greenthumb',
    job: 'the town gardener',
    icon: 'sprout',
    wants: { compost: 4, seeds: 3 },
    why: {
      compost: ['The flower beds in the square look tired.', 'Good compost makes the best tomatoes!'],
      seeds: ['I\'m planting a wildflower meadow by the station.', 'The park needs some new flowers.'],
    },
    thanks: ['The flower beds will be the best in years!', 'Green thumbs up from me!'],
    look: { animal: 'rabbit', fur: '#d9c2a0', face: '#fbf3df', inner: '#f2b5c4', nose: '#e57a8a', bg: '#cfe6b0', hat: 'bucket', hatColor: '#6f9a4a', outfit: { kind: 'overalls', color: '#e8e0c8', trim: '#5f8a3c', patch: '#d9483b' }, extras: ['neckerchief'], kerchief: '#f0bf45' },
  },
  {
    id: 'florist',
    name: 'Flora Petal',
    job: 'the florist',
    icon: 'flower',
    wants: { lily: 4, seeds: 1 },
    why: {
      lily: ['Water lilies are my best sellers.', 'I\'m making a bouquet for the new baby next door.'],
      seeds: ['Customers keep asking for seeds to grow at home.'],
    },
    thanks: ['Oh, they\'re beautiful! The shop smells like summer.', 'My window display will be the talk of the town!'],
    look: { animal: 'mouse', fur: '#c8ab92', face: '#f6e8d8', inner: '#f39ac0', nose: '#e57a8a', bg: '#f7d2df', hat: 'flowers', outfit: { kind: 'dress', color: '#f39ac0', trim: '#fffdf6' }, extras: ['pearls'] },
  },
  {
    id: 'doctor',
    name: 'Doctor Dot',
    job: 'the doctor',
    icon: 'heart',
    wants: { honey: 3, lily: 1 },
    why: {
      honey: ['Honey and lemon is the best thing for a sore throat.', 'Half of Busytown has the sniffles!'],
      lily: ['Flowers cheer up my waiting room.'],
    },
    thanks: ['Just what the doctor ordered!', 'My patients will feel better in no time.'],
    look: { animal: 'dog', fur: '#fbf6ea', face: '#fffdf6', ear: '#a8743f', spots: 'patch', spotColor: '#a8743f', nose: '#3a2a1f', bg: '#cfe8f6', hat: 'mirror', outfit: { kind: 'coat', color: '#fffdf6', trim: '#cfe3f2' }, extras: ['stethoscope', 'bowtie'], bowtie: '#4c8fd6' },
  },
  {
    id: 'mayor',
    name: 'Mayor Mossbottom',
    job: 'the mayor',
    icon: 'crown',
    wants: { lily: 2, silk: 2, honey: 1 },
    why: {
      lily: ['The town hall fountain needs some lilies.', 'We\'re decorating for the summer fair.'],
      silk: ['I need a ribbon to cut at the new bridge!', 'Silk bunting for the parade, please.'],
      honey: ['A jar of honey for our visitors from Puddleby.'],
    },
    thanks: ['Splendid! I shall mention your farm in my next speech.', 'Busytown thanks you, and so do I!'],
    look: { animal: 'toad', fur: '#8fb05a', face: '#e6e2a0', nose: '#3a2a1f', bg: '#f2e2b8', hat: 'tophat', hatColor: '#d9483b', outfit: { kind: 'jacket', color: '#3f4a6a', shirt: '#fffdf6', buttons: '#f3c43c' }, extras: ['sash', 'moustache', 'monocle'], moustache: '#5f4a32' },
  },
  {
    id: 'school',
    name: 'Miss Penny',
    job: 'the teacher at Busytown School',
    icon: 'book',
    wants: { seeds: 3, silk: 1, compost: 1 },
    why: {
      seeds: ['My class is growing a school garden.', 'We\'re learning how seeds grow.'],
      silk: ['We\'re learning about butterflies. A real chrysalis would be wonderful!'],
      compost: ['The school garden needs feeding.'],
    },
    thanks: ['The children cheered when the parcel came!', 'Top marks for your farm!'],
    look: { animal: 'owl', fur: '#b8926a', face: '#f4e6c8', bg: '#d8ecd0', outfit: { kind: 'cardigan', color: '#4a9a8a', shirt: '#fffdf6' }, extras: ['glasses', 'pencil', 'pearls'] },
  },
  {
    id: 'farmer',
    name: 'Farmer Furrow',
    job: 'the farmer over the hill',
    icon: 'leaf',
    wants: { compost: 3, seeds: 2 },
    why: {
      compost: ['My pumpkin patch is hungry.', 'Worm compost is the best there is.'],
      seeds: ['I\'m sowing a new field.'],
    },
    thanks: ['That\'ll grow a fine crop, that will!', 'Good honest farming. Thank you kindly.'],
    look: { animal: 'pig', fur: '#f2b8b0', inner: '#e8908a', snout: '#f7cbc4', bg: '#f6e0b0', hat: 'straw', hatColor: '#d9483b', outfit: { kind: 'overalls', color: '#d9483b', trim: '#4c6fa8', patch: '#f0bf45' }, extras: ['wheat'] },
  },
  {
    id: 'chef',
    name: 'Chef Crumble',
    job: 'the chef at the Busytown Café',
    icon: 'food',
    wants: { honey: 2, seeds: 2, lily: 1 },
    why: {
      honey: ['Honey-glazed carrots are on the menu today.'],
      seeds: ['Toasted seeds go on my famous salad.'],
      lily: ['A lily on every table makes the café look lovely.'],
    },
    thanks: ['Magnifique! Tonight\'s special is named after your farm.', 'Delicious. My compliments to your critters!'],
    look: { animal: 'fox', fur: '#e8833a', face: '#fbf3df', inner: '#fbf3df', nose: '#3a2a1f', bg: '#f8d6b8', hat: 'toque', outfit: { kind: 'double', color: '#fffdf6', shirt: '#fffdf6', buttons: '#c9ced6' }, extras: ['moustache', 'neckerchief'], kerchief: '#d9483b', moustache: '#8a4a22' },
  },
  {
    id: 'postie',
    name: 'Pip Parcel',
    job: 'the postman',
    icon: 'clip',
    wants: { honey: 1, seeds: 1, silk: 1, compost: 1 },
    why: {
      honey: ['A parcel of honey for my granny\'s birthday.', 'Everyone wants a jar from your farm on my round.'],
      seeds: ['Someone on Acorn Lane asked me to bring them seeds.'],
      silk: ['A silk ribbon to tie up the special parcels.'],
      compost: ['My allotment could do with a boost.'],
    },
    thanks: ['Signed, sealed and delivered!', 'Right on time, as always. Cheerio!'],
    look: { animal: 'squirrel', fur: '#c8743a', face: '#f6dfb8', inner: '#f2b5b0', nose: '#3a2a1f', bg: '#d4e2f6', hat: 'mailcap', hatColor: '#3f6aa8', outfit: { kind: 'jacket', color: '#3f6aa8', shirt: '#fffdf6', buttons: '#f3c43c' }, extras: ['satchel'] },
  },
  {
    id: 'inventor',
    name: 'Sprocket',
    job: 'the inventor at the workshop',
    icon: 'gear',
    wants: { silk: 2, compost: 2, honey: 1 },
    why: {
      silk: ['I\'m stitching a silk balloon for my flying machine!', 'Silk is the strongest thread there is.'],
      compost: ['My new engine runs on compost. Probably.', 'The workshop garden needs feeding.'],
      honey: ['A spoonful of honey keeps my gears from squeaking. Don\'t ask.'],
    },
    thanks: ['Eureka! Back to the workshop!', 'Marvellous. That\'s exactly the part I needed.'],
    look: { animal: 'beaver', fur: '#8a5a36', face: '#d9b48a', nose: '#3a2a1f', inner: '#c98a6a', bg: '#e8dcc4', hat: 'goggles', outfit: { kind: 'overalls', color: '#e8e0c8', trim: '#c9673a' }, extras: ['tools'] },
  },
  {
    id: 'petshop',
    name: 'Odette Otter',
    job: 'the keeper of the pet shop',
    icon: 'drop',
    wants: { lily: 3, seeds: 1, compost: 1 },
    why: {
      lily: ['My fish tanks look so much happier with a lily.', 'The goldfish in my window want somewhere shady.'],
      seeds: ['The budgies have eaten me out of seed again!'],
      compost: ['My worm bins need topping up.'],
    },
    thanks: ['The fish are doing happy little loops already!', 'You\'re a natural with critters, you know.'],
    look: { animal: 'otter', fur: '#7a5236', face: '#ecd8b8', nose: '#3a2a1f', inner: '#c98a6a', bg: '#c4e6e8', hat: 'kerchief', hatColor: '#2f9a9a', outfit: { kind: 'stripes', color: '#2f5d8a', trim: '#fffdf6', collar: '#2f9a9a' } },
  },
];

// Thank-you gifts Busytown sends when the farm's stars reach these totals:
// decorations you can't get any other way, and both of them do a job.
export const ORDER_GIFTS = [
  { stars: 1, decor: 'farmStand', text: 'Busytown sent you a farm stand! Each evening it sells a few spare goods for coins.' },
  { stars: 12, decor: 'deliveryVan', text: 'Busytown sent you your very own delivery van! It posts any order that\'s ready every morning.' },
];

// Friendship with a neighbour: one heart for every order sent to them.
export const MAX_HEARTS = 5;
