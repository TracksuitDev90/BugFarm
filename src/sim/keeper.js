// Who Busytown writes to. A new farm asks for a name: the keeper's own, or
// their town's, and the neighbours' letters, thank-yous and the brass plate
// on the tank all use it. It can be changed any time in Settings.
//   world.keeper = { name: 'Sam', kind: 'me' | 'town' } (null until asked)
export const NAME_MAX = 22;

export const NAME_IDEAS = {
  me: ['Pip', 'Juniper', 'Bramble', 'Clover', 'Wren', 'Hazel', 'Rowan', 'Poppy', 'Fern', 'Basil', 'Tansy', 'Sorrel'],
  town: ['Thistledown', 'Maple Hollow', 'Puddleby', 'Little Fernley', 'Honeybrook', 'Mossy Bottom', 'Pebblecombe', 'Willowmere', 'Acorn Green', 'Buttercup Lane'],
};

export function cleanName(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export function hasName(k) {
  return !!(k && k.name);
}

// How a letter opens: "Dear Sam" or "Dear friends at Maple Hollow".
export function dear(k) {
  if (!hasName(k)) return 'Dear keeper';
  return k.kind === 'town' ? `Dear friends at ${k.name}` : `Dear ${k.name}`;
}

// How a thank-you opens.
export function thanksTo(k) {
  return hasName(k) ? `Thank you, ${k.name}!` : 'Thank you!';
}

// The brass name plate on the front of the tank.
export function plateText(k) {
  if (!hasName(k)) return 'BUG FARM';
  const n = k.name.toUpperCase();
  if (k.kind === 'town') return `${n} BUG FARM`;
  return `${n}${/S$/.test(n) ? '’' : '’S'} BUG FARM`;
}
