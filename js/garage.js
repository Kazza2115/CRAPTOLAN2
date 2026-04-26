/* =============================================================
 *  Garage scene — isometric room rendered procedurally with PixiJS
 *  Style ref: Keep on Mining / Legends of Mushroom (smooth, dark, neon)
 * ============================================================= */

const PI = window.PIXI;

// ----- helpers ------------------------------------------------

const rng = (seed) => {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
};

const lerp = (a, b, t) => a + (b - a) * t;

// hex color helpers
const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
const shade = (hex, k) => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return rgb(
    Math.max(0, Math.min(255, Math.round(r * k))),
    Math.max(0, Math.min(255, Math.round(g * k))),
    Math.max(0, Math.min(255, Math.round(b * k))),
  );
};

// ----- main class ---------------------------------------------

export class Garage {
  constructor(app) {
    this.app = app;

    // Tile geometry — in scene-local pixels, origin = floor center
    this.fW = 1100;       // floor width (diamond's horizontal diameter)
    this.fH = 560;        // floor height (diamond's vertical diameter)
    this.WH = 420;        // wall height

    this.world = new PI.Container();
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);

    // Containers (z order matters)
    this.bgGlow      = new PI.Container(); this.bgGlow.zIndex = 0;
    this.wallsLayer  = new PI.Container(); this.wallsLayer.zIndex = 1;
    this.lightsWall  = new PI.Container(); this.lightsWall.zIndex = 2;
    this.floorLayer  = new PI.Container(); this.floorLayer.zIndex = 3;
    this.lightsFloor = new PI.Container(); this.lightsFloor.zIndex = 4;
    this.tubesLayer  = new PI.Container(); this.tubesLayer.zIndex = 5;
    this.fxLayer     = new PI.Container(); this.fxLayer.zIndex = 9;

    this.world.addChild(
      this.bgGlow,
      this.wallsLayer,
      this.lightsWall,
      this.floorLayer,
      this.lightsFloor,
      this.tubesLayer,
      this.fxLayer,
    );

    this.build();
    this.startFlicker();

    // resize handling
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  // -----------------------------------------------------------
  // Geometry helpers — wall-local (u, v) → scene pixels
  // u in [0..1] along wall (front → back), v in pixels (0 = floor)
  // -----------------------------------------------------------
  ptLeft (u, v) { return [ (u - 1) * this.fW / 2, -u * this.fH / 2 - v ]; }
  ptRight(u, v) { return [ (1 - u) * this.fW / 2, -u * this.fH / 2 - v ]; }

  // Project a point on the floor (uX in [-1..1], uY in [-1..1])
  ptFloor(uX, uY) {
    return [ (uX + uY) * this.fW / 4, (uY - uX) * this.fH / 4 ];
  }

  // -----------------------------------------------------------
  // Build everything
  // -----------------------------------------------------------
  build() {
    this.drawAmbientGlow();
    this.drawWall('left');
    this.drawWall('right');
    this.drawFloor();
    this.drawLight('left');
    this.drawLight('right');
    this.drawDebris();
  }

  // ---------- ambient soft halo behind the room ---------------
  drawAmbientGlow() {
    const g = new PI.Graphics();
    const r = Math.max(this.fW, this.fH);
    g.circle(0, -this.fH * 0.1, r * 0.95);
    g.fill({ color: 0x0a1018, alpha: 0.55 });
    const blur = new PI.BlurFilter({ strength: 24, quality: 4 });
    g.filters = [blur];
    this.bgGlow.addChild(g);
  }

  // ---------- walls (cinder block) ----------------------------
  drawWall(side) {
    const isLeft = side === 'left';
    const project = isLeft ? this.ptLeft.bind(this) : this.ptRight.bind(this);

    const base   = 0x6d7480;   // mid grey
    const dark   = shade(base, 0.62);
    const light  = shade(base, 1.12);
    const block  = new PI.Container();

    // 1. base panel
    const panel = new PI.Graphics();
    const a = project(0, 0);              // bottom-front
    const b = project(1, 0);              // bottom-back (= roof corner)
    const c = project(1, this.WH);        // top-back
    const d = project(0, this.WH);        // top-front
    panel.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]);
    panel.fill({ color: base });
    block.addChild(panel);

    // 2. cinder blocks pattern
    const bricksG = new PI.Graphics();
    const blockH  = 38;          // brick height (px in v)
    const blockU  = 0.135;       // brick width (in u-units along wall)
    const mortarV = 1.6;
    const mortarU = 0.004;

    const rows = Math.ceil(this.WH / blockH) + 1;
    const rand = rng(isLeft ? 17 : 91);

    for (let r = 0; r < rows; r++) {
      const v0 = r * blockH;
      const v1 = Math.min(this.WH, v0 + blockH - mortarV);
      if (v0 >= this.WH) break;
      const offset = (r % 2 === 0) ? 0 : blockU / 2;
      // start from negative u so bricks span beyond left edge (clipped by panel)
      for (let u0 = -blockU + offset; u0 < 1.0; u0 += blockU) {
        const uA = Math.max(0, u0 + mortarU);
        const uB = Math.min(1, u0 + blockU - mortarU);
        if (uB <= uA) continue;

        const p1 = project(uA, v0);
        const p2 = project(uB, v0);
        const p3 = project(uB, v1);
        const p4 = project(uA, v1);

        // slight per-brick tone variation
        const tone = lerp(0.92, 1.08, rand());
        const col  = shade(base, tone);

        bricksG.poly([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]]);
        bricksG.fill({ color: col });

        // top highlight (thin line along top edge)
        bricksG.moveTo(p1[0], p1[1] + 0.5);
        bricksG.lineTo(p2[0], p2[1] + 0.5);
        bricksG.stroke({ color: light, width: 1, alpha: 0.55 });

        // bottom shadow
        bricksG.moveTo(p4[0], p4[1] - 0.5);
        bricksG.lineTo(p3[0], p3[1] - 0.5);
        bricksG.stroke({ color: dark, width: 1, alpha: 0.7 });
      }
    }

    block.addChild(bricksG);

    // 3. ambient corner shadow (back corner is darker)
    const shadowG = new PI.Graphics();
    const sa = project(0.55, 0);
    const sb = project(1.0, 0);
    const sc = project(1.0, this.WH);
    const sd = project(0.55, this.WH);
    shadowG.poly([sa[0], sa[1], sb[0], sb[1], sc[0], sc[1], sd[0], sd[1]]);
    const grad = new PI.FillGradient(sa[0], 0, sb[0], 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    shadowG.fill(grad);
    block.addChild(shadowG);

    // 5. top trim (slightly darker line along the very top to match image)
    const trim = new PI.Graphics();
    trim.moveTo(d[0], d[1]);
    trim.lineTo(c[0], c[1]);
    trim.stroke({ color: 0x10131a, width: 2, alpha: 0.9 });
    block.addChild(trim);

    this.wallsLayer.addChild(block);
  }

  // ---------- floor (concrete) -------------------------------
  drawFloor() {
    const half = { x: this.fW / 2, y: this.fH / 2 };
    const top    = [0, -half.y];
    const right  = [half.x, 0];
    const bottom = [0, half.y];
    const left   = [-half.x, 0];

    // base
    const base = new PI.Graphics();
    base.poly([top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1]]);
    base.fill({ color: 0x9a9da3 });
    this.floorLayer.addChild(base);

    // gradient overlay (darker at back, lighter toward front-center where lights hit)
    const grad = new PI.FillGradient(0, -half.y, 0, half.y);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    const shade1 = new PI.Graphics();
    shade1.poly([top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1]]);
    shade1.fill(grad);
    this.floorLayer.addChild(shade1);

    // stains & wear
    const stains = new PI.Graphics();
    const rand = rng(42);
    for (let i = 0; i < 26; i++) {
      const ux = rand() * 1.6 - 0.8;
      const uy = rand() * 1.6 - 0.8;
      if (Math.abs(ux) + Math.abs(uy) > 0.95) { i--; continue; }
      const [x, y] = this.ptFloor(ux, uy);
      const r = 18 + rand() * 60;
      const dark = rand() > 0.5 ? 0x4a4d52 : 0x6e7178;
      stains.ellipse(x, y, r, r * 0.5);
      stains.fill({ color: dark, alpha: 0.18 + rand() * 0.18 });
    }
    this.floorLayer.addChild(stains);

    // cracks
    const cracks = new PI.Graphics();
    for (let i = 0; i < 6; i++) {
      const ux = rand() * 1.4 - 0.7;
      const uy = rand() * 1.4 - 0.7;
      const [x, y] = this.ptFloor(ux, uy);
      let cx = x, cy = y;
      cracks.moveTo(cx, cy);
      const segs = 4 + Math.floor(rand() * 4);
      for (let s = 0; s < segs; s++) {
        cx += (rand() - 0.5) * 80;
        cy += (rand() - 0.5) * 40;
        cracks.lineTo(cx, cy);
      }
      cracks.stroke({ color: 0x1f2127, width: 1.2, alpha: 0.45 });
    }
    this.floorLayer.addChild(cracks);

    // outline (front edges only — softens the diamond)
    const edge = new PI.Graphics();
    edge.moveTo(left[0], left[1]).lineTo(bottom[0], bottom[1]).lineTo(right[0], right[1]);
    edge.stroke({ color: 0x12141a, width: 1.5, alpha: 0.85 });
    this.floorLayer.addChild(edge);

    // floor is the click target
    base.eventMode = 'static';
    base.cursor = 'pointer';
    base.hitArea = new PI.Polygon([
      top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1],
    ]);
    this._floorHit = base;
  }

  // ---------- floor debris (small pebbles like the reference) -
  drawDebris() {
    const rand = rng(7);
    const debris = new PI.Graphics();
    for (let i = 0; i < 10; i++) {
      const ux = rand() * 1.6 - 0.8;
      const uy = rand() * 1.6 - 0.8;
      if (Math.abs(ux) + Math.abs(uy) > 0.85) { i--; continue; }
      const [x, y] = this.ptFloor(ux, uy);
      const r = 1.5 + rand() * 3.5;
      debris.circle(x, y - r * 0.4, r);
      debris.fill({ color: 0x2a2c31, alpha: 0.95 });
      debris.ellipse(x, y + 1, r * 1.3, r * 0.4);
      debris.fill({ color: 0x000000, alpha: 0.25 });
    }
    this.floorLayer.addChild(debris);
  }

  // ---------- fluorescent tube + cone --------------------------
  drawLight(side) {
    const isLeft = side === 'left';
    const project = isLeft ? this.ptLeft.bind(this) : this.ptRight.bind(this);

    // tube position (along wall) — close to the back corner, near top
    const u0 = 0.46;
    const u1 = 0.74;
    const v  = this.WH - 38;       // distance from floor (high)
    const tubeThick = 7;

    // tube polygon (thin parallelogram on the wall surface)
    const t1 = project(u0, v + tubeThick / 2);
    const t2 = project(u1, v + tubeThick / 2);
    const t3 = project(u1, v - tubeThick / 2);
    const t4 = project(u0, v - tubeThick / 2);

    // ----- glow halo (blurry larger version) -----
    const halo = new PI.Graphics();
    const h1 = project(u0 - 0.04, v + 18);
    const h2 = project(u1 + 0.04, v + 18);
    const h3 = project(u1 + 0.04, v - 18);
    const h4 = project(u0 - 0.04, v - 18);
    halo.poly([h1[0], h1[1], h2[0], h2[1], h3[0], h3[1], h4[0], h4[1]]);
    halo.fill({ color: 0xb6e8ff, alpha: 0.55 });
    halo.filters = [new PI.BlurFilter({ strength: 18, quality: 4 })];
    this.tubesLayer.addChild(halo);

    // ----- tube housing (slightly darker frame around the tube) -----
    const housing = new PI.Graphics();
    const f1 = project(u0 - 0.012, v + 7);
    const f2 = project(u1 + 0.012, v + 7);
    const f3 = project(u1 + 0.012, v - 7);
    const f4 = project(u0 - 0.012, v - 7);
    housing.poly([f1[0], f1[1], f2[0], f2[1], f3[0], f3[1], f4[0], f4[1]]);
    housing.fill({ color: 0x1a1d24 });
    this.tubesLayer.addChild(housing);

    // ----- tube core (bright white-blue) -----
    const tube = new PI.Graphics();
    tube.poly([t1[0], t1[1], t2[0], t2[1], t3[0], t3[1], t4[0], t4[1]]);
    tube.fill({ color: 0xeaf6ff });
    this.tubesLayer.addChild(tube);

    // tiny end caps
    const cap = new PI.Graphics();
    cap.circle(t1[0], (t1[1] + t4[1]) / 2, 2.2).fill({ color: 0x222831 });
    cap.circle(t2[0], (t2[1] + t3[1]) / 2, 2.2).fill({ color: 0x222831 });
    this.tubesLayer.addChild(cap);

    // ----- cone of light on the wall (fading downward) -----
    const coneTopWidthU = 0.04;
    const coneBottomWidthU = 0.32;
    const cTop1 = project(u0 - coneTopWidthU, v - 4);
    const cTop2 = project(u1 + coneTopWidthU, v - 4);
    const cBot1 = project(u0 - coneBottomWidthU, 0);
    const cBot2 = project(u1 + coneBottomWidthU, 0);

    const cone = new PI.Graphics();
    cone.poly([cTop1[0], cTop1[1], cTop2[0], cTop2[1], cBot2[0], cBot2[1], cBot1[0], cBot1[1]]);

    // gradient: bright at the top (near the tube), fades downward
    const yTop = Math.min(cTop1[1], cTop2[1]);
    const yBot = Math.max(cBot1[1], cBot2[1]);
    const grad = new PI.FillGradient(0, yTop, 0, yBot);
    grad.addColorStop(0, 'rgba(200, 235, 255, 0.45)');
    grad.addColorStop(0.55, 'rgba(180, 220, 255, 0.16)');
    grad.addColorStop(1, 'rgba(140, 200, 255, 0)');
    cone.fill(grad);
    cone.blendMode = 'add';
    this.lightsWall.addChild(cone);

    // ----- soft splash on the floor at the wall's foot -----
    const baseFloorPt = project(0.55, 0);          // approx where light hits floor
    const splash = new PI.Graphics();
    splash.ellipse(baseFloorPt[0], baseFloorPt[1] + 30, 200, 70);
    splash.fill({ color: 0xb6e0ff, alpha: 0.10 });
    splash.filters = [new PI.BlurFilter({ strength: 30, quality: 4 })];
    splash.blendMode = 'add';
    this.lightsFloor.addChild(splash);

    // store for flicker
    this._lights = this._lights || [];
    this._lights.push({ tube, halo, cone, splash });
  }

  // ---------- subtle flicker animation -----------------------
  startFlicker() {
    let t = 0;
    this.app.ticker.add((tick) => {
      t += tick.deltaMS / 1000;
      // tiny breathing
      const breath = 0.92 + 0.08 * Math.sin(t * 1.7);
      // rare flicker
      const flicker = (Math.random() < 0.004) ? 0.55 : 1;
      const k = breath * flicker;

      for (const L of (this._lights || [])) {
        L.halo.alpha   = 0.55 * k;
        L.cone.alpha   = 0.95 * k;
        L.splash.alpha = 1.0  * k;
        L.tube.alpha   = Math.min(1, 0.85 + 0.15 * k);
      }
    });
  }

  // ---------- click handling ---------------------------------
  onFloorClick(callback) {
    if (!this._floorHit) return;
    this._floorHit.on('pointertap', (e) => {
      const local = e.global;
      callback({ x: local.x, y: local.y });
      this.spawnRipple(e.getLocalPosition(this.world));
    });
  }

  spawnRipple(local) {
    const g = new PI.Graphics();
    g.circle(0, 0, 4);
    g.stroke({ color: 0x9ee2ff, width: 2, alpha: 0.9 });
    g.x = local.x; g.y = local.y;
    this.fxLayer.addChild(g);
    let life = 0;
    const max = 0.45;
    const tick = (t) => {
      life += t.deltaMS / 1000;
      const k = Math.min(1, life / max);
      g.scale.set(1 + k * 12);
      g.alpha = 1 - k;
      if (k >= 1) {
        this.app.ticker.remove(tick);
        g.destroy();
      }
    };
    this.app.ticker.add(tick);
  }

  // ---------- responsive scaling -----------------------------
  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.app.renderer.resize(w, h);

    // keep room comfortably inside, leaving room for HUD top + shop right
    const padTop = 100;
    const padRight = 360;     // shop width + margin
    const padLeft = 30;
    const padBot = 80;

    const availW = Math.max(400, w - padLeft - padRight);
    const availH = Math.max(300, h - padTop - padBot);

    // bounding box of the room (in scene coords)
    const roomW = this.fW;
    const roomH = this.fH / 2 + this.WH;     // visible vertical extent
    const scale = Math.min(availW / roomW, availH / roomH) * 0.95;

    this.world.scale.set(scale);
    // center horizontally in the available area, vertically a bit lower
    const cx = padLeft + availW / 2;
    const cy = padTop + availH / 2 + (this.WH * scale) / 4;
    this.world.x = cx;
    this.world.y = cy;
  }

  destroy() {
    window.removeEventListener('resize', this._resize);
    this.world.destroy({ children: true });
  }
}
