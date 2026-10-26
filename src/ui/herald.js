// The herald decides when the keeper hears about things. Discoveries, news
// from the tank (births, dreams come true, farewells), level-ups and tips all
// queue here instead of popping up the moment they happen, so the keeper
// sees one thing at a time with a breather in between. A brand-new farm is
// especially calm; the pace picks up gently over its first couple of days.
// Nothing is lost: whatever goes stale in the queue is still in the journal
// and the log, and the herald mentions how many discoveries are waiting.
// No DOM here, so the pacing can be tested headless.
//
//   prio 3: a zone levelled up       (always shown, barely waits)
//        2: a discovery that unlocked something new
//        1: other discoveries, news worth knowing
//        0: tips and small news      (only when nothing else is waiting)
const LIFE = [60, 150, 600, 1e9]; // seconds an item may wait, by priority

export class Herald {
  constructor() {
    this.q = [];
    this.now = 0;
    this.last = -1e9; // when the last notice was shown
    this.holdUntil = 0;
    this.busyAt = -1e9; // the last moment the keeper was busy
    this.skipped = 0; // discoveries that went stale (for the summary)
    this.seq = 0;
  }

  // How long to leave between notices (real seconds), given how many game
  // days old the farm is: roomy at first, then a steady, gentle rhythm of
  // no more than one a minute (however busy the tank gets).
  gap(farmDays) {
    const calm = Math.max(0, Math.min(1, 1 - farmDays / 2.5));
    return 60 + 50 * calm;
  }

  // Something else just took the stage (a letter from Busytown): the next
  // notice waits its turn after it.
  note() {
    this.last = this.now;
  }

  // Keep quiet for a while (a new farm settling in, a big moment).
  hold(seconds) {
    this.holdUntil = Math.max(this.holdUntil, this.now + seconds);
  }

  // item: { prio, kind, key?, show() }. An item with the same key as one
  // already waiting replaces it (two births in a row become the latest one).
  push(item) {
    item.at = this.now;
    item.n = this.seq++;
    if (item.key) {
      const i = this.q.findIndex((o) => o.key === item.key);
      if (i >= 0) this.q.splice(i, 1);
    }
    this.q.push(item);
    // the highest priority first, then oldest first
    this.q.sort((a, b) => b.prio - a.prio || a.n - b.n);
  }

  // Called every frame. busy: the keeper is in the middle of something (a
  // dialog, a letter on screen, painting), so nothing new interrupts.
  // Returns the item to show now, or null.
  tick(dt, farmDays, busy) {
    this.now += dt;
    for (let i = this.q.length - 1; i >= 0; i--) {
      const it = this.q[i];
      if (this.now - it.at > LIFE[it.prio]) {
        if (it.kind === 'discovery') this.skipped++;
        this.q.splice(i, 1);
      }
    }
    if (busy) this.busyAt = this.now;
    // (and a few seconds' grace after a dialog or letter closes)
    if (busy || this.now < this.holdUntil || this.now - this.busyAt < 4) return null;
    const since = this.now - this.last;
    const gap = this.gap(farmDays);
    let next = this.q[0] || null;
    // a few discoveries went by unseen: say so, once, when there's a lull
    if (!next && this.skipped >= 2 && since >= gap * 1.5) {
      const n = this.skipped;
      this.skipped = 0;
      next = { prio: 1, kind: 'summary', n };
      this.last = this.now;
      return next;
    }
    if (!next) return null;
    const need = next.prio >= 3 ? 6 : next.prio === 0 ? gap * 1.6 : gap;
    if (since < need) return null;
    this.q.shift();
    this.last = this.now;
    return next;
  }

  get waiting() {
    return this.q.length;
  }
}

// What a line in the tank's log is worth as news: { prio, key } or null for
// things the keeper already knows (they did it) or that only belong in the
// log. Only the latest of each key waits in the queue.
export function newsPriority(l) {
  const text = l.text;
  if (/^Discovery|reached level|^Welcome|^Mayor Mossbottom sent|^Bought|^Sent |^Collected|^The builders/.test(text)) return null;
  if (l.icon === 'crown') return { prio: 1, key: null };
  if (l.icon === 'flower') return { prio: 1, key: 'farewell' };
  if (l.icon === 'star') {
    if (/dream came true/.test(text)) return { prio: 1, key: 'dream' };
    if (/honey|reported for duty/.test(text)) return { prio: 0, key: 'made' };
    return { prio: 1, key: 'change' };
  }
  // (newcomers "moving in" were adopted or bought: the keeper knows)
  if (l.icon === 'heart' && /had .*(egg|bab)/.test(text)) return { prio: 0, key: 'birth' };
  return null;
}
