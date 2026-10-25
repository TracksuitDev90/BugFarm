// Busytown in the UI: the neighbours' portraits, the letters that pop up
// when they write, their thank-yous when an order arrives, and the Market
// where the farm spends its coins on each neighbour's special ware.
import { el, esc, artCanvas, creatureArt } from './dom.js';
import { iconCanvas } from '../art/icons.js';
import { NEIGHBOURS, MAX_HEARTS } from '../data/neighbours.js';
import { WARES } from '../data/market.js';
import { DECOR } from '../data/decor.js';
import { FOODS } from '../data/foods.js';
import { SPECIES } from '../data/species.js';
import { GOODS } from '../data/goods.js';
import { drawFolk, FOLK_BOX } from '../art/townsfolk.js';
import { finishSprite } from '../art/paper.js';
import { DECOR_ART, decorBox } from '../art/decor.js';
import { drawFood } from '../art/food.js';
import { drawPlant } from '../art/plants.js';
import { drawGood, goodBox } from '../art/goods.js';
import { WARE_ART } from '../art/wares.js';
import { Plant } from '../entities/plant.js';
import { neighbour, needsWords } from '../sim/orders.js';
import { wareState, buy } from '../sim/market.js';
import { ZONE_NAMES } from '../sim/care.js';
import { dear, thanksTo } from '../sim/keeper.js';

// A neighbour's portrait. mood: 'ask' | 'happy'
export function folkCanvas(nb, mood = 'ask', css = 72) {
  return artCanvas([css, Math.round(css * 1.12)], FOLK_BOX, (g) => {
    drawFolk(g, nb.look, mood);
    finishSprite(g, FOLK_BOX, { grain: 0.5 });
  });
}

// ♥♥♥♡♡: friendship with a neighbour (the newest heart can pop in).
export function heartsEl(n, popNew) {
  const box = el('span', { class: 'hearts', 'aria-label': `${n} of ${MAX_HEARTS} hearts` });
  for (let i = 0; i < MAX_HEARTS; i++) box.append(el('i', { class: (i < n ? 'on' : '') + (popNew && i === n - 1 ? ' new' : '') }, i < n ? '♥' : '♡'));
  return box;
}

export function coinsEl(n, cls = '') {
  return el('span', { class: 'coins ' + cls }, iconCanvas('coin', 18), el('b', {}, String(n)));
}

// A builder's sketch of the new ground: a slab of sand, water or soil with
// a spade stuck in it and a little flag.
function drawBuild(g, zone) {
  const col = { desert: ['#e8c483', '#c99c5f'], pond: ['#8cc8e6', '#4f86b0'], jungle: ['#7d5538', '#5f3e28'] }[zone];
  g.lineWidth = 1.4;
  g.strokeStyle = '#3a2a1f';
  g.beginPath();
  g.moveTo(-26, 4);
  g.quadraticCurveTo(-8, -2, 26, 3);
  g.lineTo(26, 18);
  g.lineTo(-26, 18);
  g.closePath();
  g.fillStyle = col[0];
  g.fill();
  g.stroke();
  if (zone === 'pond') {
    g.beginPath();
    g.moveTo(-26, 12);
    g.quadraticCurveTo(0, 9, 26, 12);
    g.lineTo(26, 18);
    g.lineTo(-26, 18);
    g.closePath();
    g.fillStyle = '#a69a87';
    g.fill();
    g.stroke();
  }
  if (zone === 'jungle') {
    for (const x of [-18, -6, 8, 20]) {
      g.beginPath();
      g.moveTo(x, 2);
      g.quadraticCurveTo(x - 3, -6, x - 6, -8);
      g.moveTo(x, 2);
      g.quadraticCurveTo(x + 2, -7, x + 5, -9);
      g.strokeStyle = '#4f8a3c';
      g.stroke();
    }
    g.strokeStyle = '#3a2a1f';
  }
  // the spade
  g.beginPath();
  g.moveTo(10, 2);
  g.lineTo(16, -22);
  g.lineWidth = 2.6;
  g.strokeStyle = '#8a5a2c';
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = '#3a2a1f';
  g.beginPath();
  g.moveTo(5, 1);
  g.lineTo(13, 3);
  g.lineTo(11, 11);
  g.lineTo(3, 9);
  g.closePath();
  g.fillStyle = '#b7bcc2';
  g.fill();
  g.stroke();
  // the flag
  g.beginPath();
  g.moveTo(-14, 3);
  g.lineTo(-14, -24);
  g.lineWidth = 1.4;
  g.stroke();
  g.beginPath();
  g.moveTo(-14, -24);
  g.lineTo(-2, -20);
  g.lineTo(-14, -16);
  g.closePath();
  g.fillStyle = '#e2553f';
  g.fill();
  g.stroke();
}

// A picture of a ware, whatever kind of thing it is.
export function wareCanvas(ware, css = 56) {
  const size = [css, Math.round(css * 0.86)];
  if (ware.kind === 'decor') return artCanvas(size, decorBox(DECOR[ware.decor]), (g) => DECOR_ART[ware.decor](g, 0));
  if (ware.kind === 'critter') return creatureArt(ware.sp, SPECIES[ware.sp].adultStage, SPECIES[ware.sp].fish ? 'swim' : 'idle', 0, null, '#e2553f', size);
  if (ware.kind === 'plant') {
    const p = new Plant(ware.plant, 0, 0, { growth: 1, waterY: -50, seed: 7 });
    return artCanvas(size, p.shape.box, (g) => drawPlant(g, p, 0));
  }
  if (ware.kind === 'stock') return artCanvas(size, [-11, -12, 11, 3], (g) => drawFood(g, FOODS.bun, 0));
  if (ware.id === 'courier') return creatureArt('dragonfly', 'adult', 'idle', 4, 'post', '#3f6aa8', size);
  if (ware.kind === 'build') return artCanvas(size, [-30, -28, 30, 22], (g) => drawBuild(g, ware.zone));
  const a = WARE_ART[ware.id];
  return a ? artCanvas(size, a.box, a.draw) : iconCanvas('shop', css * 0.7);
}

// The first ware a neighbour hasn't offered yet, and how many more orders
// it'll take.
export function nextOffer(journal, w, who) {
  for (const wr of WARES) {
    if (wr.who !== who) continue;
    const st = wareState(journal, w, wr);
    if (st.state === 'locked') return { ware: wr, need: st.need };
  }
  return null;
}

// ------------------------------------------------------------------ pop-ups
// A card that slides in under the clock: a letter, or a thank-you. They
// queue up, one at a time.
export class Postbag {
  constructor(ui) {
    this.ui = ui;
    this.q = [];
    this.cur = null;
    this.box = el('section', { id: 'post', class: 'hidden', 'aria-live': 'polite' });
  }

  push(card) {
    this.q.push(card);
    if (!this.cur) this.next();
  }

  next() {
    const ui = this.ui;
    clearTimeout(this.timer);
    this.cur = this.q.shift() || null;
    this.box.innerHTML = '';
    ui.toasts.classList.toggle('low', !!this.cur);
    if (!this.cur) {
      this.box.classList.add('hidden');
      return;
    }
    this.box.append(this.cur.el);
    this.box.classList.remove('hidden');
    ui.herald.note();
    this.timer = setTimeout(() => this.next(), this.cur.ms || 12000);
  }

  // Someone in Busytown has written to the farm.
  letter(o) {
    const ui = this.ui;
    const nb = neighbour(o.who);
    const w = ui.world;
    const ord = ui.journal.orders;
    const offer = nextOffer(ui.journal, w, nb.id);
    const pay = ord.pay(o);
    const card = el('div', { class: 'panel postcard' },
      el('div', { class: 'pc-art' }, folkCanvas(nb, 'ask', 84)),
      el('div', { class: 'pc-body' },
        el('div', { class: 'pc-name' }, el('b', {}, nb.name), ` · ${nb.job}`),
        el('div', { class: 'bubble' }, `“${dear(w.keeper)}, could you send ${needsWords(o.needs)}? ${o.why}”`),
        el('div', { class: 'pc-pay' }, coinsEl(pay.total), el('span', {}, `+ ★${o.stars} and treats`), heartsEl(ord.heartsOf(nb.id))),
        offer ? el('div', { class: 'pc-offer' }, `Help ${nb.name} ${offer.need === 1 ? 'once more' : offer.need + ' more times'} and they'll sell you the `, el('b', {}, offer.ware.name.toLowerCase()), '!') : null,
        el('div', { class: 'pc-btns' },
          el('button', { class: 'btn small', onclick: () => this.next() }, 'Later'),
          el('button', { class: 'btn small yellow', onclick: () => {
            this.next();
            ui.openOrders();
          } }, 'See the letter'))));
    this.push({ el: card, ms: 14000 });
  }

  // An order arrived in Busytown, and they're delighted.
  thanks(r) {
    const ui = this.ui;
    const nb = r.nb;
    const parts = [];
    if (r.pay.tip) parts.push(`${r.pay.tip} tip from a friend`);
    if (r.pay.board) parts.push(`${r.pay.board} from the notice board`);
    if (r.pay.fans) parts.push(`${r.pay.fans} from the axolotl's fans`);
    const card = el('div', { class: 'panel postcard thanks' },
      el('div', { class: 'pc-art' }, folkCanvas(nb, 'happy', 84)),
      el('div', { class: 'pc-body' },
        el('div', { class: 'pc-name' }, el('b', {}, nb.name), ' says thank you!'),
        el('div', { class: 'bubble' }, `“${thanksTo(ui.world.keeper)} ${r.thanks}”`),
        el('div', { class: 'pc-pay' }, coinsEl('+' + r.pay.total, 'big'), el('span', {}, `★${r.o.stars}${r.treats.length ? ' · treats for the critters' : ''}`), heartsEl(r.hearts, true)),
        parts.length ? el('div', { class: 'pc-small' }, `(${r.pay.base} for the order, ${parts.join(', ')})`) : null,
        ...r.offers.map((wr) => el('div', { class: 'pc-offer new' }, `${nb.name} will now sell you the `, el('b', {}, wr.name.toLowerCase()), ' at the Market!')),
        ...r.gifts.map((gf) => el('div', { class: 'pc-offer new' }, gf.text)),
        el('div', { class: 'pc-btns' },
          el('button', { class: 'btn small', onclick: () => this.next() }, 'Lovely!'),
          r.offers.length ? el('button', { class: 'btn small yellow', onclick: () => {
            this.next();
            ui.openMarket();
          } }, 'Visit the Market') : null)));
    this.push({ el: card, ms: r.offers.length ? 16000 : 9000 });
  }
}

// ------------------------------------------------------------------ the Market
// Stalls come in order: something to buy first, then friends still to make,
// then neighbours whose wares the farm already owns.
function stallRank(journal, w, nb) {
  const states = WARES.filter((wr) => wr.who === nb.id).map((wr) => wareState(journal, w, wr));
  if (states.some((s) => s.state === 'sale')) return 0;
  if (states.some((s) => s.state === 'locked')) return 1 + Math.min(...states.filter((s) => s.state === 'locked').map((s) => s.need)) * 0.1;
  return 3;
}

export function buildMarket(ui, b, head) {
  const w = ui.world;
  const j = ui.journal;
  head.insertBefore(el('div', { class: 'purse-big' }, coinsEl(w.coins, 'big')), head.lastChild);
  b.append(el('p', { class: 'small' }, 'Everyone in Busytown makes something special. Send them the goods they ask for to become friends (♥), and they\'ll sell it to your farm. Coins come with every thank-you.'));
  const stalls = NEIGHBOURS.slice().sort((a, b2) => stallRank(j, w, a) - stallRank(j, w, b2));
  const grid = el('div', { class: 'market' });
  for (const nb of stalls) {
    const wares = WARES.filter((wr) => wr.who === nb.id);
    if (!wares.length) continue;
    const h = j.orders.heartsOf(nb.id);
    const stall = el('div', { class: 'stall' },
      el('div', { class: 'stall-head' }, folkCanvas(nb, 'ask', 58), el('div', {}, el('b', {}, nb.name), el('div', { class: 'small' }, nb.job), heartsEl(h))));
    for (const wr of wares) {
      const st = wareState(j, w, wr);
      let act;
      if (st.state === 'owned') act = el('span', { class: 'owned' }, '✓ Yours');
      else if (st.state === 'locked') act = el('span', { class: 'locked' }, iconCanvas('lock', 16), st.lock ? `Ready ${st.lock}` : `${st.need} more ${st.need === 1 ? 'order' : 'orders'} for ${nb.name.split(' ')[0]}`);
      else {
        act = el('button', { class: 'btn small' + (st.afford ? ' yellow' : ''), disabled: !st.afford, onclick: () => {
          const r = buy(j, w, wr);
          if (r.ok && r.build) {
            // off go the builders: the game saves, builds and comes back
            ui.sound.play('sparkle', 0.9);
            if (ui.hooks.expandTank(r.build)) {
              ui.closeModal();
              return;
            }
            w.coins += r.cost;
            ui.toast('The builders couldn\'t get started (this browser wouldn\'t let the farm save). Your coins are back in your purse.', '!', true, 6000);
            ui.openMarket();
            return;
          }
          ui.sound.play(r.ok ? 'sparkle' : 'pop', r.ok ? 0.9 : 0.4);
          ui.toast(r.ok ? `<b>${esc(wr.name)}!</b> ${esc(r.msg)}` : esc(r.msg), r.ok ? 'coin' : '!', r.ok, r.ok ? 6000 : 3200);
          if (r.ok) {
            ui.haptic(25);
            ui.hooks.save();
          }
          ui.openMarket();
          ui.updateHUD(true);
        } }, iconCanvas('coin', 18), st.cost ? String(st.cost) : 'Free');
      }
      const stock = wr.kind === 'stock' && w.stock[wr.id] ? el('div', { class: 'small' }, `You have ${w.stock[wr.id]}.`) : null;
      const title = wr.kind === 'build' ? `${wr.name}${st.owned ? '' : ` (${st.tier + 1} of ${st.max})`}` : wr.name;
      const text = wr.kind === 'build' && st.owned ? `The ${ZONE_NAMES[wr.zone].toLowerCase()} is as big as Bertie can make it.` : st.state === 'locked' ? `“${wr.pitch}”` : wr.what;
      stall.append(el('div', { class: 'ware ' + st.state }, wareCanvas(wr, 56), el('div', { class: 'ware-text' }, el('b', {}, title), el('div', { class: 'small' }, text), stock), el('div', { class: 'ware-buy' }, act)));
    }
    grid.append(stall);
  }
  b.append(grid);
}

// A good's little picture (for letters in the Orders list).
export function goodIcon(type, css = 22) {
  return artCanvas([css, css], goodBox(type), (g) => drawGood(g, type, ''));
}

export { GOODS };
