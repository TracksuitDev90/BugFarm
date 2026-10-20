// Cute names for critters. Big critters get a name; colonies of tiny ones
// still get one each because everyone deserves a name.
const NAMES = [
  'Pip', 'Bean', 'Hazel', 'Clover', 'Biscuit', 'Pickles', 'Mabel', 'Ollie', 'Nutmeg', 'Juniper', 'Tilly', 'Dot',
  'Button', 'Pudding', 'Waffles', 'Pepper', 'Sprout', 'Maple', 'Fig', 'Olive', 'Chester', 'Rosie', 'Bramble', 'Poppy',
  'Basil', 'Clementine', 'Dumpling', 'Fennel', 'Gus', 'Hattie', 'Iggy', 'Jasper', 'Kiwi', 'Lulu', 'Moss', 'Noodle',
  'Otis', 'Peanut', 'Quince', 'Radish', 'Saffron', 'Tater', 'Umber', 'Violet', 'Wren', 'Ziggy', 'Acorn', 'Bluebell',
  'Cocoa', 'Daisy', 'Ellie', 'Fudge', 'Ginger', 'Honey', 'Inky', 'Jellybean', 'Kipper', 'Lemon', 'Mochi', 'Nibbles',
  'Oatmeal', 'Pebble', 'Puddle', 'Rascal', 'Sunny', 'Toffee', 'Tumble', 'Velvet', 'Whiskers', 'Yam', 'Zuzu', 'Alfie',
  'Bonnie', 'Cricket', 'Dandelion', 'Elmo', 'Flick', 'Goober', 'Hops', 'Ivy', 'Jinx', 'Kernel', 'Lentil', 'Mango',
  'Nugget', 'Orzo', 'Pumpkin', 'Rolo', 'Scout', 'Truffle', 'Waldo', 'Zest', 'Barnaby', 'Cosmo', 'Dorothy', 'Edgar',
  'Florence', 'Gilbert', 'Harriet', 'Humphrey', 'Agnes', 'Bertie', 'Cornelius', 'Delphine', 'Ernest', 'Fern', 'Gertie',
  'Horace', 'Ida', 'Juniper', 'Lionel', 'Matilda', 'Nigel', 'Opal', 'Percy', 'Rupert', 'Sylvie', 'Theodore', 'Winnie',
  'Archie', 'Beatrix', 'Cedric', 'Doris', 'Fitz', 'Greta', 'Hugo', 'Irma', 'Monty', 'Nellie', 'Pippin', 'Roscoe',
  'Smudge', 'Twig', 'Wobble', 'Squiggle', 'Bubbles', 'Sprinkles', 'Marbles', 'Doodle', 'Puff', 'Snickerdoodle',
];
const FANCY = {
  ant: ['Dig', 'Scoop', 'Crumb', 'Tunnel', 'Grit', 'Sandy', 'Rusty', 'Speck'],
  cricket: ['Fiddle', 'Chirpy', 'Melody', 'Banjo', 'Tempo'],
  goldfish: ['Bubbles', 'Goldie', 'Finn', 'Splash', 'Marmalade', 'Sunny'],
  frog: ['Ribbit', 'Lily', 'Hopkins', 'Croaker', 'Puddles'],
  turtle: ['Shelly', 'Sir Paddles', 'Slowpoke', 'Tortellini', 'Myrtle'],
  snail: ['Speedy', 'Shelby', 'Escargot', 'Slinky', 'Gary'],
  bee: ['Buzz', 'Bumble', 'Honeypot', 'Beatrice', 'Stripes'],
  firefly: ['Sparky', 'Glimmer', 'Twinkle', 'Lumen', 'Blinky'],
  ladybug: ['Dotty', 'Lady Penelope', 'Spots', 'Ruby', 'Cherry'],
  worm: ['Wiggles', 'Noodle', 'Squirmy', 'Earl', 'Loam'],
  pillbug: ['Roly', 'Poly', 'Marble', 'Pebbles', 'Bowling Ball'],
  gecko: ['Smiley', 'Gizmo', 'Lizzie', 'Sunny', 'Spot'],
  butterfly: ['Flutter', 'Monarch', 'Papillon', 'Wings', 'Petal'],
};

export function randomName(sp) {
  const f = FANCY[sp];
  if (f && Math.random() < 0.25) return f[Math.floor(Math.random() * f.length)];
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}
