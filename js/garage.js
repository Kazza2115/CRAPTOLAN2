/* =============================================================
 *  Garage scene — isometric room rendered procedurally with PixiJS
 *  Style ref: Keep on Mining / Legends of Mushroom — warm cartoon,
 *  chunky shapes, soft outlines, cozy amber lighting.
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

// ===== PALETTE — cool gray garage, chunky cartoon =============
const C = {
  // walls (cool gray-blue concrete bricks)
  wallBase:   0x5a626e,   // mid brick face
  wallLight:  0x808896,   // lit top edge
  wallDark:   0x3a3f48,   // shadow bottom edge
  wallEdgeL:  0x707783,   // subtle left highlight
  wallEdgeR:  0x363b43,   // subtle right shadow
  mortar:     0x14161a,   // deep recess between bricks
  // floor (cool gray concrete)
  floorBase:  0x6e727a,
  floorLight: 0x8b8f97,
  floorDark:  0x4a4d54,
  floorStain: 0x35373d,
  // outline (cartoon black)
  outline:    0x0a0b0e,
  // light (warm — only warm element to give cozy contrast)
  tubeCore:   0xfff1c2,
  tubeGlow:   0xffc875,
  // ambient
  ambient:    0x141821,
};

// ===== Garage class ============================================

export class Garage {
  constructor(app) {
    this.app = app;

    // Tile geometry — in scene-local pixels, origin = floor center
    this.fW = 1100;       // floor diamond width
    this.fH = 560;        // floor diamond height (2:1 iso)
    this.WH = 360;        // wall height

    this.world = new PI.Container();
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);

    // z-ordered layers
    this.bgGlow      = new PI.Container(); this.bgGlow.zIndex      = 0;
    this.wallsLayer  = new PI.Container(); this.wallsLayer.zIndex  = 1;
    this.lightsWall  = new PI.Container(); this.lightsWall.zIndex  = 2;
    this.floorLayer  = new PI.Container(); this.floorLayer.zIndex  = 3;
    this.lightsFloor = new PI.Container(); this.lightsFloor.zIndex = 4;
    this.outlineLay  = new PI.Container(); this.outlineLay.zIndex  = 5;
    this.tubesLayer  = new PI.Container(); this.tubesLayer.zIndex  = 6;
    this.fxLayer     = new PI.Container(); this.fxLayer.zIndex     = 9;

    this.world.addChild(
      this.bgGlow,
      this.wallsLayer,
      this.lightsWall,
      this.floorLayer,
      this.lightsFloor,
      this.outlineLay,
      this.tubesLayer,
      this.fxLayer,
    );

    this.build();
    this.startFlicker();

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  // ---- geometry helpers ---------------------------------------
  ptLeft (u, v) { return [ (u - 1) * this.fW / 2, -u * this.fH / 2 - v ]; }
  ptRight(u, v) { return [ (1 - u) * this.fW / 2, -u * this.fH / 2 - v ]; }
  ptFloor(uX, uY) { return [ (uX + uY) * this.fW / 4, (uY - uX) * this.fH / 4 ]; }

  build() {
    this.drawAmbientGlow();
    this.drawFloor();
    this.drawWall('left');
    this.drawWall('right');
    this.drawCornerSeam();
    this.drawSilhouettes();
    this.drawLight('left');
    this.drawLight('right');
  }

  // ---------- soft cool halo behind the room ------------------
  drawAmbientGlow() {
    const g = new PI.Graphics();
    const r = Math.max(this.fW, this.fH) * 1.05;
    g.circle(0, -this.fH * 0.15, r);
    g.fill({ color: C.ambient, alpha: 0.85 });
    g.filters = [new PI.BlurFilter({ strength: 32, quality: 4 })];
    this.bgGlow.addChild(g);
  }

  // ---------- walls (chunky cartoon cinder blocks) -------------
  drawWall(side) {
    const isLeft = side === 'left';
    const project = isLeft ? this.ptLeft.bind(this) : this.ptRight.bind(this);
    const block = new PI.Container();

    // 1. mortar (the gap color shows through brick gaps)
    const panel = new PI.Graphics();
    const a = project(0, 0);
    const b = project(1, 0);
    const c = project(1, this.WH);
    const d = project(0, this.WH);
    panel.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]);
    panel.fill({ color: C.mortar });
    block.addChild(panel);

    // 2. bricks — chunky 3D relief (each brick is a small protruding volume)
    const bricksG = new PI.Graphics();
    const blockH  = 52;          // brick height (px in v)
    const blockU  = 0.165;       // brick width (in u-units along wall)
    const mortarV = 3;           // recessed mortar gap (vertical)
    const mortarU = 0.008;       // recessed mortar gap (horizontal)
    const bevelV  = 4;           // top/bottom bevel band thickness (px)
    const bevelU  = 0.005;       // left/right bevel band thickness (u)

    const rows = Math.ceil(this.WH / blockH) + 1;
    const rand = rng(isLeft ? 17 : 91);

    const drawQuad = (uA, uB, v0, v1, color, alpha) => {
      const p1 = project(uA, v1);
      const p2 = project(uB, v1);
      const p3 = project(uB, v0);
      const p4 = project(uA, v0);
      bricksG.poly([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]]);
      bricksG.fill(alpha != null ? { color, alpha } : { color });
    };

    for (let r = 0; r < rows; r++) {
      const v0 = r * blockH;
      const v1 = Math.min(this.WH, v0 + blockH - mortarV);
      if (v0 >= this.WH) break;
      const offset = (r % 2 === 0) ? 0 : blockU / 2;

      for (let u0 = -blockU + offset; u0 < 1.0; u0 += blockU) {
        const uA = Math.max(0, u0 + mortarU);
        const uB = Math.min(1, u0 + blockU - mortarU);
        if (uB <= uA) continue;

        // -- brick base face (slight per-brick tone variation) --
        const tone = lerp(0.93, 1.07, rand());
        const col  = shade(C.wallBase, tone);
        drawQuad(uA, uB, v0, v1, col);

        // -- top highlight band (light hits top edge) --
        const hiV0 = Math.max(v0, v1 - bevelV);
        drawQuad(uA, uB, hiV0, v1, C.wallLight);

        // -- bottom shadow band (deep shadow under each brick) --
        const loV1 = Math.min(v1, v0 + bevelV);
        drawQuad(uA, uB, v0, loV1, C.wallDark);

        // -- left edge subtle highlight (light coming from camera-front-left) --
        const uLA = uA;
        const uLB = Math.min(uB, uA + bevelU);
        if (uLB > uLA) drawQuad(uLA, uLB, v0 + bevelV * 0.4, v1 - bevelV * 0.4, C.wallEdgeL, 0.7);

        // -- right edge subtle shadow --
        const uRA = Math.max(uA, uB - bevelU);
        const uRB = uB;
        if (uRB > uRA) drawQuad(uRA, uRB, v0 + bevelV * 0.4, v1 - bevelV * 0.4, C.wallEdgeR, 0.85);

        // -- tiny top-left highlight pixel for the bevel intersection --
        const cornerHi = drawQuad;
        cornerHi(uA, Math.min(uB, uA + bevelU), v1 - bevelV, v1, 0xa6aebb, 0.85);
      }
    }
    block.addChild(bricksG);

    // 3. ambient corner shadow (back corner is darker — receding into shadow)
    const shadowG = new PI.Graphics();
    const sa = project(0.55, 0);
    const sb = project(1.0, 0);
    const sc = project(1.0, this.WH);
    const sd = project(0.55, this.WH);
    shadowG.poly([sa[0], sa[1], sb[0], sb[1], sc[0], sc[1], sd[0], sd[1]]);
    const grad = new PI.FillGradient(sa[0], 0, sb[0], 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,4,10,0.55)');
    shadowG.fill(grad);
    block.addChild(shadowG);

    this.wallsLayer.addChild(block);
  }

  // ---------- thick cartoon outlines around the room ----------
  drawSilhouettes() {
    const g = new PI.Graphics();
    const W = this.fW / 2, H = this.fH / 2;
    const top    = [0, -H];
    const right  = [W, 0];
    const bottom = [0, H];
    const left   = [-W, 0];
    const topUp  = [0, -H - this.WH];
    const leftUp = [-W, -this.WH];
    const rightUp= [W, -this.WH];

    const lineW = 4.5;
    const stroke = { color: C.outline, width: lineW, alpha: 1, cap: 'round', join: 'round' };

    // Outer wall silhouette — left wall (front edge: floor; back edge: ceiling)
    g.moveTo(left[0], left[1]).lineTo(leftUp[0], leftUp[1]).lineTo(topUp[0], topUp[1]);
    g.stroke(stroke);
    // Right wall silhouette
    g.moveTo(right[0], right[1]).lineTo(rightUp[0], rightUp[1]).lineTo(topUp[0], topUp[1]);
    g.stroke(stroke);
    // Top ridge from left up to top up to right up — already covered above

    // Wall-floor seam (left and right back edges of floor)
    g.moveTo(left[0], left[1]).lineTo(top[0], top[1]).lineTo(right[0], right[1]);
    g.stroke({ ...stroke, width: lineW * 0.85, alpha: 0.85 });

    // Floor front edges
    g.moveTo(left[0], left[1]).lineTo(bottom[0], bottom[1]).lineTo(right[0], right[1]);
    g.stroke({ ...stroke, width: lineW, alpha: 1 });

    this.outlineLay.addChild(g);
  }

  // ---------- vertical seam between the two back walls ---------
  drawCornerSeam() {
    const g = new PI.Graphics();
    g.moveTo(0, -this.fH / 2).lineTo(0, -this.fH / 2 - this.WH);
    g.stroke({ color: C.outline, width: 3.5, alpha: 0.85 });
    this.wallsLayer.addChild(g);
  }

  // ---------- floor (warm beige cartoon concrete) -------------
  drawFloor() {
    const half = { x: this.fW / 2, y: this.fH / 2 };
    const top    = [0, -half.y];
    const right  = [half.x, 0];
    const bottom = [0, half.y];
    const left   = [-half.x, 0];

    // base
    const base = new PI.Graphics();
    base.poly([top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1]]);
    base.fill({ color: C.floorBase });
    this.floorLayer.addChild(base);

    // gentle vertical light gradient — back darker, front darker (lit middle)
    const grad = new PI.FillGradient(0, -half.y, 0, half.y);
    grad.addColorStop(0,    'rgba(8,12,20,0.50)');
    grad.addColorStop(0.55, 'rgba(8,12,20,0.05)');
    grad.addColorStop(1,    'rgba(8,12,20,0.30)');
    const shade1 = new PI.Graphics();
    shade1.poly([top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1]]);
    shade1.fill(grad);
    this.floorLayer.addChild(shade1);

    // soft cartoon stains — fewer, larger, warm-toned
    const stains = new PI.Graphics();
    const rand = rng(42);
    for (let i = 0; i < 16; i++) {
      const ux = rand() * 1.6 - 0.8;
      const uy = rand() * 1.6 - 0.8;
      if (Math.abs(ux) + Math.abs(uy) > 0.92) { i--; continue; }
      const [x, y] = this.ptFloor(ux, uy);
      const r = 30 + rand() * 70;
      stains.ellipse(x, y, r, r * 0.55);
      stains.fill({ color: C.floorStain, alpha: 0.10 + rand() * 0.10 });
    }
    this.floorLayer.addChild(stains);

    // a few highlight scuffs for texture (lighter beige)
    const hi = new PI.Graphics();
    for (let i = 0; i < 8; i++) {
      const ux = rand() * 1.5 - 0.75;
      const uy = rand() * 1.5 - 0.75;
      if (Math.abs(ux) + Math.abs(uy) > 0.85) { i--; continue; }
      const [x, y] = this.ptFloor(ux, uy);
      hi.ellipse(x, y, 60 + rand() * 50, 22 + rand() * 18);
      hi.fill({ color: C.floorLight, alpha: 0.10 + rand() * 0.08 });
    }
    this.floorLayer.addChild(hi);

    // click target
    base.eventMode = 'static';
    base.cursor = 'pointer';
    base.hitArea = new PI.Polygon([
      top[0], top[1], right[0], right[1], bottom[0], bottom[1], left[0], left[1],
    ]);
    this._floorHit = base;
  }

  // ---------- fluorescent tube + amber cone of light ----------
  drawLight(side) {
    const isLeft = side === 'left';
    const project = isLeft ? this.ptLeft.bind(this) : this.ptRight.bind(this);

    const u0 = 0.46;
    const u1 = 0.74;
    const v  = this.WH - 38;
    const tubeThick = 7;

    const t1 = project(u0, v + tubeThick / 2);
    const t2 = project(u1, v + tubeThick / 2);
    const t3 = project(u1, v - tubeThick / 2);
    const t4 = project(u0, v - tubeThick / 2);

    // glow halo (warm amber, blurry)
    const halo = new PI.Graphics();
    const h1 = project(u0 - 0.05, v + 22);
    const h2 = project(u1 + 0.05, v + 22);
    const h3 = project(u1 + 0.05, v - 22);
    const h4 = project(u0 - 0.05, v - 22);
    halo.poly([h1[0], h1[1], h2[0], h2[1], h3[0], h3[1], h4[0], h4[1]]);
    halo.fill({ color: C.tubeGlow, alpha: 0.65 });
    halo.filters = [new PI.BlurFilter({ strength: 22, quality: 4 })];
    this.tubesLayer.addChild(halo);

    // dark housing behind the tube
    const housing = new PI.Graphics();
    const f1 = project(u0 - 0.012, v + 8);
    const f2 = project(u1 + 0.012, v + 8);
    const f3 = project(u1 + 0.012, v - 8);
    const f4 = project(u0 - 0.012, v - 8);
    housing.poly([f1[0], f1[1], f2[0], f2[1], f3[0], f3[1], f4[0], f4[1]]);
    housing.fill({ color: C.outline });
    this.tubesLayer.addChild(housing);

    // tube core (warm white)
    const tube = new PI.Graphics();
    tube.poly([t1[0], t1[1], t2[0], t2[1], t3[0], t3[1], t4[0], t4[1]]);
    tube.fill({ color: C.tubeCore });
    this.tubesLayer.addChild(tube);

    // end caps
    const cap = new PI.Graphics();
    cap.circle(t1[0], (t1[1] + t4[1]) / 2, 2.4).fill({ color: 0x111111 });
    cap.circle(t2[0], (t2[1] + t3[1]) / 2, 2.4).fill({ color: 0x111111 });
    this.tubesLayer.addChild(cap);

    // wall cone — warm amber, additive
    const coneTopWidthU = 0.04;
    const coneBottomWidthU = 0.34;
    const cTop1 = project(u0 - coneTopWidthU, v - 4);
    const cTop2 = project(u1 + coneTopWidthU, v - 4);
    const cBot1 = project(u0 - coneBottomWidthU, 0);
    const cBot2 = project(u1 + coneBottomWidthU, 0);

    const cone = new PI.Graphics();
    cone.poly([cTop1[0], cTop1[1], cTop2[0], cTop2[1], cBot2[0], cBot2[1], cBot1[0], cBot1[1]]);
    const yTop = Math.min(cTop1[1], cTop2[1]);
    const yBot = Math.max(cBot1[1], cBot2[1]);
    const grad = new PI.FillGradient(0, yTop, 0, yBot);
    grad.addColorStop(0,    'rgba(255,235,180,0.55)');
    grad.addColorStop(0.55, 'rgba(255,210,140,0.18)');
    grad.addColorStop(1,    'rgba(255,200,130,0)');
    cone.fill(grad);
    cone.blendMode = 'add';
    this.lightsWall.addChild(cone);

    // floor splash
    const baseFloorPt = project(0.55, 0);
    const splash = new PI.Graphics();
    splash.ellipse(baseFloorPt[0], baseFloorPt[1] + 32, 220, 78);
    splash.fill({ color: C.tubeGlow, alpha: 0.18 });
    splash.filters = [new PI.BlurFilter({ strength: 32, quality: 4 })];
    splash.blendMode = 'add';
    this.lightsFloor.addChild(splash);

    this._lights = this._lights || [];
    this._lights.push({ tube, halo, cone, splash });
  }

  // ---------- subtle flicker animation -----------------------
  startFlicker() {
    let t = 0;
    this.app.ticker.add((tick) => {
      t += tick.deltaMS / 1000;
      const breath = 0.93 + 0.07 * Math.sin(t * 1.6);
      const flicker = (Math.random() < 0.003) ? 0.6 : 1;
      const k = breath * flicker;
      for (const L of (this._lights || [])) {
        L.halo.alpha   = 0.65 * k;
        L.cone.alpha   = 1.0  * k;
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
    g.stroke({ color: C.tubeGlow, width: 2.5, alpha: 0.95 });
    g.x = local.x; g.y = local.y;
    this.fxLayer.addChild(g);
    let life = 0;
    const max = 0.5;
    const tick = (t) => {
      life += t.deltaMS / 1000;
      const k = Math.min(1, life / max);
      g.scale.set(1 + k * 13);
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

    const padTop = 80;
    const padBot = 200;
    const availH = Math.max(280, h - padTop - padBot);
    const availW = w;

    const roomW = this.fW;
    const roomH = this.fH / 2 + this.WH;
    const FRAME_FRACTION = 0.62;
    const scale = Math.min(
      (availW * FRAME_FRACTION) / roomW,
      (availH * FRAME_FRACTION) / roomH,
    );

    this.world.scale.set(scale);

    const targetCY = padTop + availH / 2;
    this.world.x = w / 2;
    this.world.y = targetCY + (this.WH / 2) * scale;
  }

  destroy() {
    window.removeEventListener('resize', this._resize);
    this.world.destroy({ children: true });
  }
}
