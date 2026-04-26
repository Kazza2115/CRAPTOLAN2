/* ==============================================================
 *  Game state — base IDLE mechanics
 *  Currency: BYTES
 *  Generators: configurable list (add more later)
 *  Persistence: localStorage + offline progress
 * ============================================================== */

const SAVE_KEY  = 'craptolan2.save.v1';
const TICK_HZ   = 30;             // UI refresh rate
const COST_RAMP = 1.15;           // each purchase increases the cost

// --- Generator catalog -----------------------------------------
// Add entries here to extend the game. The UI builds itself from this list.
export const GENERATORS = [
  {
    id: 'kiddie',
    name: 'Script Kiddie',
    desc: 'Génère des bytes sans rien comprendre au code.',
    icon: '🧑‍💻',
    baseCost: 10,
    baseRate: 1,            // bytes per second
    unlockBytes: 0,
  },
  {
    id: 'dev',
    name: 'Dev Junior',
    desc: 'Sait deboguer le wifi du garage.',
    icon: '👨‍🔧',
    baseCost: 100,
    baseRate: 8,
    unlockBytes: 50,
  },
  {
    id: 'pentester',
    name: 'Pentester',
    desc: 'Renifle les paquets entre deux cafés.',
    icon: '🕵️',
    baseCost: 1100,
    baseRate: 60,
    unlockBytes: 600,
  },
  {
    id: 'rig',
    name: 'Rig de minage',
    desc: 'Bruyant. Chaud. Rentable.',
    icon: '⛏️',
    baseCost: 12000,
    baseRate: 500,
    unlockBytes: 6000,
  },
];

// ---- save schema ----------------------------------------------
const defaultState = () => ({
  bytes: 0,
  totalEarned: 0,
  clickValue: 1,
  owned: Object.fromEntries(GENERATORS.map((g) => [g.id, 0])),
  lastTs: Date.now(),
});

// ---- pure helpers --------------------------------------------
export const costOf = (gen, owned) =>
  Math.ceil(gen.baseCost * Math.pow(COST_RAMP, owned));

export const rateOf = (state) =>
  GENERATORS.reduce((sum, g) => sum + g.baseRate * (state.owned[g.id] || 0), 0);

// ---- Game class ----------------------------------------------
export class Game {
  constructor() {
    this.state = this.load() || defaultState();
    this.listeners = new Set();
    this._lastTick = performance.now();
    this._lastSave = performance.now();

    // process offline progress on startup
    this.applyOffline();

    // game tick loop (UI binding + economy accumulation)
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ----- pub/sub for UI bindings --------------------------------
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state); }

  // ----- main loop ---------------------------------------------
  _loop(now) {
    const dt = (now - this._lastTick) / 1000;
    this._lastTick = now;

    const earned = rateOf(this.state) * dt;
    if (earned > 0) {
      this.state.bytes += earned;
      this.state.totalEarned += earned;
    }
    this.emit();

    // autosave every 5s
    if (now - this._lastSave > 5000) {
      this.save();
      this._lastSave = now;
    }
    requestAnimationFrame(this._loop);
  }

  // ----- public actions ----------------------------------------
  click() {
    const v = this.state.clickValue;
    this.state.bytes += v;
    this.state.totalEarned += v;
    this.emit();
    return v;
  }

  buy(genId) {
    const gen = GENERATORS.find((g) => g.id === genId);
    if (!gen) return false;
    const owned = this.state.owned[gen.id] || 0;
    const cost = costOf(gen, owned);
    if (this.state.bytes < cost) return false;
    this.state.bytes -= cost;
    this.state.owned[gen.id] = owned + 1;
    this.emit();
    this.save();
    return true;
  }

  // ----- persistence -------------------------------------------
  save() {
    this.state.lastTs = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (_) { /* private mode etc. */ }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // ensure all generator slots exist (forward-compat)
      const merged = defaultState();
      Object.assign(merged, parsed);
      merged.owned = { ...defaultState().owned, ...(parsed.owned || {}) };
      return merged;
    } catch (_) { return null; }
  }
  reset() {
    this.state = defaultState();
    this.save();
    this.emit();
  }

  applyOffline() {
    const last = this.state.lastTs || Date.now();
    const dtMs = Math.max(0, Date.now() - last);
    const dt = Math.min(dtMs / 1000, 60 * 60 * 12); // cap at 12h
    const gain = rateOf(this.state) * dt;
    if (gain > 0) {
      this.state.bytes += gain;
      this.state.totalEarned += gain;
      this._offlineGain = gain;
      this._offlineSec = dt;
    }
  }
}
