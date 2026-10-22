// The neighbours in Busytown who write to the farm for its goods. Each has
// a job, the goods they need for it and a few reasons why, so the letters
// read like they come from real busy people.
//   wants: good -> how much they like asking for it
//   why:   good -> reasons ({n} is filled in with what they ask for)
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
  },
];

// Thank-you gifts Busytown sends when the farm's stars reach these totals:
// decorations you can't get any other way.
export const ORDER_GIFTS = [
  { stars: 1, decor: 'farmStand', text: 'Busytown sent you a farm stand to show off your goods!' },
  { stars: 12, decor: 'deliveryVan', text: 'Busytown sent you your very own delivery van!' },
];
