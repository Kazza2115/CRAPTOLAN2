/* ==============================================================
 *  UI bindings (HUD + Shop)
 * ============================================================== */

import { GENERATORS, costOf, rateOf } from './game.js';

const fmt = (n) => {
  if (n < 10)    return n.toFixed(1);
  if (n < 1e3)   return Math.floor(n).toString();
  if (n < 1e6)   return (n / 1e3).toFixed(2) + 'K';
  if (n < 1e9)   return (n / 1e6).toFixed(2) + 'M';
  if (n < 1e12)  return (n / 1e9).toFixed(2) + 'B';
  return n.toExponential(2);
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.byteEl = document.querySelector('[data-bind="bytes"]');
    this.rateEl = document.querySelector('[data-bind="rate"]');
    this._lastBytes = -1;
    game.subscribe((s) => this.render(s));
    this.render(game.state);
  }
  render(s) {
    const b = s.bytes;
    if (Math.floor(b) !== this._lastBytes) {
      this.byteEl.textContent = fmt(b);
      this._lastBytes = Math.floor(b);
    }
    this.rateEl.textContent = fmt(rateOf(s));
  }
  bump() {
    this.byteEl.classList.remove('bump');
    void this.byteEl.offsetWidth; // restart animation
    this.byteEl.classList.add('bump');
  }
}

export class Shop {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud;
    this.list = document.getElementById('shop-list');
    this.rows = new Map();
    this.build();
    game.subscribe((s) => this.refresh(s));
    this.refresh(game.state);
  }
  build() {
    this.list.innerHTML = '';
    for (const g of GENERATORS) {
      const row = document.createElement('div');
      row.className = 'upgrade locked';
      row.innerHTML = `
        <div class="upgrade-icon">${g.icon}</div>
        <div class="upgrade-info">
          <h3>${g.name}</h3>
          <div class="desc">${g.desc}</div>
          <div class="stats">
            <span class="prod">+${fmt(g.baseRate)} /s</span>
            <span class="qty">×<span data-count="${g.id}">0</span></span>
          </div>
        </div>
        <button class="buy-btn" data-buy="${g.id}" disabled>
          <span class="price" data-price="${g.id}">${fmt(g.baseCost)}</span>
          <span class="price-suffix">POINTS</span>
        </button>
      `;
      this.list.appendChild(row);
      this.rows.set(g.id, row);
      row.querySelector('button').addEventListener('click', () => {
        if (this.game.buy(g.id)) this.hud.bump();
      });
    }
  }
  refresh(s) {
    for (const g of GENERATORS) {
      const row   = this.rows.get(g.id);
      const owned = s.owned[g.id] || 0;
      const cost  = costOf(g, owned);
      const reachedUnlock = s.totalEarned >= g.unlockBytes;
      const canBuy = s.bytes >= cost && reachedUnlock;

      row.classList.toggle('locked', !reachedUnlock);

      row.querySelector(`[data-count="${g.id}"]`).textContent = owned;
      row.querySelector(`[data-price="${g.id}"]`).textContent = fmt(cost);
      const btn = row.querySelector(`[data-buy="${g.id}"]`);
      btn.disabled = !canBuy;
    }
  }
}

export function spawnFloatingNumber(x, y, value) {
  const el = document.createElement('div');
  el.className = 'float-num';
  el.textContent = '+' + value;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.getElementById('fx-layer').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

export function hideHintOnce() {
  const h = document.getElementById('click-hint');
  if (!h) return;
  h.classList.add('hidden');
  setTimeout(() => h.remove(), 600);
}
