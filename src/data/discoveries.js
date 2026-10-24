// Discoveries are the game's gentle goals: real things that happen when the
// player experiments. Each can reward an unlockable decoration or style.
//   on:     event name that may trigger it
//   test:   optional check on the event data
//   check:  periodic check on world state (instead of an event)
//   reward: { decor } or { style: [key, value] }
export const DISCOVERIES = [
  { id: 'feed', title: 'Snack time!', text: 'You dropped in some food. Watch who comes to nibble!', hint: 'Try the Feed tool.', on: 'feed' },
  { id: 'pet', title: 'Gentle touch', text: 'You gave a critter a little pat. Some love it, some get shy!', hint: 'Tap a critter, then press Pet.', on: 'pet' },
  { id: 'tap', title: 'Knock knock', text: 'Tapping on the glass startles the critters nearby. Better be gentle!', hint: 'Tap an empty spot on the glass.', on: 'tapGlass', test: (d) => d.n > 0 },
  { id: 'antDig', title: 'Tunnel engineers', text: 'The ants dug a new tunnel and carried every grain of sand up to build their mound.', hint: 'Give the ant colony some time.', on: 'antDig', count: 6, reward: { decor: 'bench' } },
  { id: 'antChamber', title: 'A brand-new room', text: 'The ants carved out a whole new chamber in their nest.', hint: 'A growing colony needs more rooms.', on: 'antChamber', reward: { decor: 'fence' } },
  { id: 'antTrail', title: 'Follow the scent', text: 'An ant followed its sisters\' scent trail straight to the food. Try the Scent lens!', hint: 'Drop food near the ant nest.', on: 'antFind', test: (d) => d.recruited, reward: { decor: 'mailbox' } },
  { id: 'aphidFarm', title: 'Ant farmers', text: 'An ant visited the aphids to collect sweet honeydew. Ants look after aphids like little cows!', hint: 'Ants and aphids need to be able to reach each other.', on: 'aphidFarm', reward: { decor: 'bananaCar' } },
  { id: 'antGuard', title: 'Bodyguards', text: 'Ants shooed a ladybug away from their aphid herd.', hint: 'What happens when ants, aphids and ladybugs meet?', on: 'antGuard', reward: { decor: 'pickleCar' } },
  { id: 'antHide', title: 'Keeping cool', text: 'When the sand got too hot, the ants retreated deep underground where it stays cool.', hint: 'Turn the desert heat lamp way up.', on: 'antHide' },
  { id: 'ladybugSnack', title: 'Garden hero', text: 'A ladybug gobbled up an aphid. Ladybugs keep aphids from tiring out the plants.', hint: 'Ladybugs love aphids.', on: 'predation', test: (d) => d.pred.sp === 'ladybug' },
  { id: 'huddle', title: 'Cuddle puddle', text: 'Chilly ladybugs huddled together to keep each other warm.', hint: 'Turn the jungle lamp off and let it get cold.', on: 'huddle', reward: { style: ['backdrop', 'night'] } },
  { id: 'cricketTemp', title: 'Thermometer bug', text: 'Crickets chirp faster when it is warm and slower when it is cool. You can tell the temperature by counting chirps!', hint: 'Listen to crickets at night in warm AND cool desert air.', on: 'chirp', test: (d, w, j) => {
    if (d.T >= 27) j.flag('chirpWarm');
    if (d.T <= 20) j.flag('chirpCool');
    return j.has('chirpWarm') && j.has('chirpCool');
  }, reward: { decor: 'windmill' } },
  { id: 'frogMeta', title: 'Tadpole to frog', text: 'A wriggly tadpole grew legs, lost its tail and hopped out as a frog!', hint: 'Keep tadpoles fed. Warmer water speeds them up.', on: 'metamorph', test: (d) => d.kind === 'frog', reward: { decor: 'teapot' } },
  { id: 'pupate', title: 'Wrapped up', text: 'A caterpillar made itself a jade chrysalis.', hint: 'Caterpillars need lots of leaves.', on: 'pupate' },
  { id: 'butterflyMeta', title: 'A big change', text: 'A butterfly came out of its chrysalis and stretched its wings!', hint: 'Wait for a chrysalis to open.', on: 'metamorph', test: (d) => d.kind === 'butterfly', reward: { decor: 'appleHouse' } },
  { id: 'fruitflies', title: 'Uninvited guests', text: 'Old fruit got squishy and fruit flies showed up.', hint: 'Leave fruit lying around for a while...', on: 'fruitfly', reward: { decor: 'doughnutShop' } },
  { id: 'frogSnack', title: 'Lightning tongue', text: 'A frog snapped up a bug with its super-fast tongue.', hint: 'Frogs like flies and crickets.', on: 'predation', test: (d) => d.pred.sp === 'frog' },
  { id: 'geckoSnack', title: 'Gecko lunch', text: 'The gecko caught itself a snack. Feeding it bug bites keeps the crickets safer!', hint: 'Geckos hunt when they are hungry.', on: 'predation', test: (d) => d.pred.sp === 'gecko' },
  { id: 'bask', title: 'Sunbather', text: 'A cold-blooded critter basked under the heat lamp to warm up its body.', hint: 'Geckos and turtles love a warm lamp.', on: 'bask' },
  { id: 'gasp', title: 'Stuffy water', text: 'Fish gulped air at the surface because the water ran low on oxygen. Warm water and spoiled food make it worse; the filter and bubbles help.', hint: 'Turn the filter off and make the water warm.', on: 'gasp', reward: { decor: 'diver' } },
  { id: 'cloudy', title: 'Murky water', text: 'Leftover food spoiled in the pond and turned the water cloudy.', hint: 'Overfeed the pond and wait.', check: (w) => w.env.pond.clarity < 0.62, reward: { decor: 'chest' } },
  { id: 'algae', title: 'Green soup', text: 'Algae bloomed and turned the pond green. Snails, shrimp and tadpoles love to graze it.', hint: 'Light + leftover food + no filter = algae.', check: (w) => w.env.pond.algae > 0.5, reward: { style: ['water', 'green'] } },
  { id: 'estivate', title: 'Do not disturb', text: 'A snail sealed itself inside its shell to wait out the dry weather.', hint: 'Let the jungle get very dry.', on: 'estivate', reward: { decor: 'shell' } },
  { id: 'wormRain', title: 'Rainy-day wiggle', text: 'Earthworms popped up to the surface when the soil got soaking wet.', hint: 'Turn the jungle mister all the way up.', on: 'wormRain', reward: { decor: 'boot' } },
  { id: 'pollinate', title: 'Busy bee', text: 'A bee carried pollen from flower to flower. Pollinated flowers make seeds!', hint: 'Bees need flowers.', on: 'pollinate', test: (d) => d.c.sp === 'bee' },
  { id: 'sprout', title: 'Seeds of change', text: 'Seeds from a flower sprouted into a brand-new plant.', hint: 'Healthy, pollinated flowers drop seeds.', on: 'sprout', reward: { style: ['sand', 'rainbow'] } },
  { id: 'fireflySync', title: 'Flashing in time', text: 'The fireflies started blinking together, all in time. Nobody leads — they just nudge toward their neighbours.', hint: 'Watch a few fireflies on a dark night.', on: 'fireflySync', reward: { style: ['backdrop', 'town'] } },
  { id: 'headstand', title: 'Dew drinker', text: 'A desert beetle did a headstand so dew could trickle down its back into its mouth.', hint: 'Mist the desert a little and watch at dawn.', on: 'headstand', reward: { style: ['backdrop', 'desert'] } },
  { id: 'moveIn', title: 'Home sweet home', text: 'A critter moved into one of your decorations and made it home. Critters sleep, hide and shelter from the weather in their homes, and peek out of the door to see what is going on.', hint: 'Put a cottage, a hollow log or a flowerpot near some critters.', on: 'moveIn' },
  { id: 'pondHome', title: 'Hidey-hole', text: 'A pond critter moved into a hidey-hole under the water. Fish doze in the castle; shrimp and snails love a shell or a clay pipe.', hint: 'Sink a castle, a shell or a clay pipe in the pond.', on: 'moveIn', test: (d) => d.d.wet },
  { id: 'dashHome', title: 'Duck and cover', text: 'Startled critters dashed home to hide. Give them a moment and they will peek out again.', hint: 'Tap the glass near a critter that has a home.', on: 'dashHome' },
  { id: 'queenMove', title: 'Royal removal', text: 'The ant queen moved her court to a comfier room, with her workers fussing around her. Real queens move house when the nest gets too hot, too cold or too crowded.', hint: 'Let the colony dig a few rooms, then change the desert heat.', on: 'queenMove' },
  { id: 'explore', title: 'New horizons', text: 'Critters came to explore a change you made to the tank: fresh ground, a new hole or new water. They notice when their world changes.', hint: 'Dig, pile up sand or flood a new channel with the Shape tool.', on: 'explore' },
  { id: 'antAdopt', title: 'Moving in', text: 'The ant scouts explored a hollow you dug underground and the colony made it into a new room.', hint: 'Dig a little cave near the ant nest.', on: 'antAdopt' },
  { id: 'antShare', title: 'A tummy to share', text: 'One ant fed a hungry sister mouth to mouth. Ants pass food round the whole colony like this.', hint: 'Keep the ants well fed and watch inside the nest.', on: 'antShare' },
  { id: 'antShoo', title: 'Guard duty', text: 'Guard ants at the nest door shooed a big visitor away.', hint: 'Watch the ant nest entrance when other critters wander by.', on: 'antShoo' },
  { id: 'gift', title: 'Sharing is caring', text: 'A critter carried some food over to a hungry neighbour and set it down in front of them.', hint: 'Drop more food than one critter can eat, near some hungry friends.', on: 'gift' },
  { id: 'stash', title: 'Saving it for later', text: 'A full-up critter carried a snack home to keep for later. Squirrels do the same!', hint: 'Drop food near a critter that has just eaten.', on: 'stash' },
  { id: 'beg', title: 'Feeding time!', text: 'The goldfish have learned what the keeper means. They crowd up to the top when the food comes out, and wait at the usual time of day.', hint: 'Feed the fish at the same spot and time for a few days, or open the Feed tool.', on: 'beg' },
  { id: 'roll', title: 'Roly-poly', text: 'A pill bug rolled itself into a tight little ball.', hint: 'Pill bugs are shy.', on: 'roll' },
  { id: 'stuffed', title: 'Too many snacks', text: 'A critter ate so much it got round and slow. Too much food can be as tricky as too little!', hint: 'Overfeed someone.', on: 'stuffed', reward: { style: ['gravel', 'rainbow'] } },
  { id: 'hungry', title: 'Rumbly tummies', text: 'A critter got very hungry. Hungry critters get thin, slow and grumpy — and predators get bolder.', hint: 'Forget to feed for a while.', check: (w) => w.creatures.some((c) => !c.dead && c.hunger > 0.88 && c.sp !== 'fruitfly') },
  { id: 'coldSlow', title: 'Slowpokes', text: 'In the cold, cold-blooded critters slow right down. Warm them up and they speed back up!', hint: 'Turn the heat lamps off at night.', check: (w) => w.creatures.some((c) => !c.dead && c.def.ecto && c.moving && c.T < c.def.temp[1] - 5) },
  { id: 'birth', title: 'New arrivals', text: 'A baby was born (or an egg was laid) in your tank!', hint: 'Happy, well-fed grown-ups have babies.', on: 'birth', test: (d) => !d.quiet },
  { id: 'memorial', title: 'Circle of life', text: 'A little forget-me-not grew where a critter passed away, helping the soil grow new life.', hint: 'Every life comes to an end someday.', on: 'memorial', reward: { style: ['backdrop', 'seaside'] } },
  { id: 'night', title: 'Night owl', text: 'You watched the tank at night. Different critters wake up after dark!', hint: 'Stay up until night time.', check: (w) => w.env.isNight, reward: { style: ['wallpaper', 'sky'] } },
  { id: 'crowd', title: 'Bustling tank', text: 'Over 60 critters are living in your tank at once!', hint: 'Help everyone thrive.', check: (w) => w.creatures.length >= 60, reward: { style: ['frame', 'red'] } },
  { id: 'bigColony', title: 'Growing colony', text: 'The ant colony has 20 ants!', hint: 'Keep the ants well fed.', check: (w) => (w.counts.ant || 0) >= 20, reward: { style: ['frame', 'blue'] } },
  { id: 'deepDig', title: 'Master diggers', text: 'The ants have dug out 500 bits of sand. What a nest!', hint: 'Patience...', check: (w) => w.colonies.some((c) => c.dug >= 500), reward: { style: ['wallpaper', 'mint'] } },
  { id: 'skyDance', title: 'Sky dance', text: 'Two butterflies met in the air and spiralled up into the sky together, round and round each other. Butterflies dance like this to say hello.', hint: 'Keep a few happy butterflies in the jungle.', on: 'dance' },
  { id: 'thermal', title: 'Riding the thermals', text: 'Warm air rises under a heat lamp. A flyer spiralled up in it on open wings without flapping, then glided away.', hint: 'Turn a heat lamp up on a sunny day and watch the butterflies.', on: 'soar' },
  { id: 'mothLamp', title: 'Moth to a lamp', text: 'Moths steer by the moon, so a bright lamp at night muddles them and they loop round and round it.', hint: 'Keep a moth, and a light on at night.', on: 'mothLamp' },
  { id: 'koiCoin', title: 'Lucky koi', text: 'A koi rummaged in the gravel with its whiskers and turned up a lost Busytown coin!', hint: 'Koi are sold at the Busytown pet shop.', on: 'koiCoin' },
  { id: 'rare', title: 'A rare beauty', text: 'A rare butterfly came out of its chrysalis in the butterfly house. Keep watching: there are three rare kinds to find.', hint: 'Tilly Thimble sells a butterfly house at the Market.', on: 'rare' },
  { id: 'dragonflyMeta', title: 'Out of the water', text: 'A dragonfly nymph climbed out of the pond, split its skin and flew off on four new wings.', hint: 'Adopt dragonfly nymphs and keep them fed.', on: 'metamorph', test: (d) => d.kind === 'dragonfly' },
  { id: 'mothMeta', title: 'Out of the cocoon', text: 'A moth came out of its silk cocoon. Moths and butterflies both start as caterpillars.', hint: 'Adopt a moth caterpillar.', on: 'metamorph', test: (d) => d.kind === 'moth' },
  { id: 'antHarvest', title: 'Ant larder', text: 'Harvester and honeypot ants store food for hard times. When the store was full, they left some by the door for you.', hint: 'Adopt harvester or honeypot ants and feed the desert.', on: 'antHarvest' },
  { id: 'clinic', title: 'Get well soon', text: 'A poorly critter checked into the critter clinic for some rest and soup.', hint: 'Doctor Dot sells a clinic at the Market.', on: 'clinic' },
  { id: 'busyBun', title: 'Busy as a bee', text: 'A critter nibbled a busy bun and got to work at double speed.', hint: 'Baker Bramble sells busy buns at the Market.', on: 'busy' },
  { id: 'dream', title: 'A dream come true', text: 'A critter\'s dream came true! Every grown-up has one. Tap a critter to see what it dreams of.', hint: 'Tap a critter and read its dream.', on: 'dream' },
  { id: 'friends', title: 'Good neighbours', text: 'You have helped one neighbour three times. Good friends tip a little extra and sell you their special wares.', hint: 'Send orders to the same neighbour.', on: 'delivered', test: (d) => d.hearts >= 3 },
  { id: 'lullaby', title: 'Night chorus', text: 'The crickets sang the night chorus and the whole tank slept sounder for it. A fence gives them a stage.', hint: 'Keep crickets happy and listen at night.', check: (w) => w.chorus > 0.6 && w.env.isNight },
  { id: 'wilt', title: 'Thirsty plants', text: 'A plant wilted because it was too hot or too dry. Plants need the right weather too!', hint: 'Turn off the jungle mister.', check: (w) => w.plants.some((p) => !p.dead && p.health < 0.45), reward: { style: ['water', 'teal'] } },
];

export const DISC_BY_ID = {};
for (const d of DISCOVERIES) DISC_BY_ID[d.id] = d;

// Items that start locked; unlocked by the discovery that rewards them.
export function lockedItems() {
  const out = { decor: new Set(), style: new Set() };
  for (const d of DISCOVERIES) {
    if (!d.reward) continue;
    if (d.reward.decor) out.decor.add(d.reward.decor);
    if (d.reward.style) out.style.add(d.reward.style.join(':'));
  }
  return out;
}
