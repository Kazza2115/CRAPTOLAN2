/* ==============================================================
 *  Entry point — wires PixiJS scene + game state + UI
 * ============================================================== */

import { Garage }       from './garage.js';
import { Game }         from './game.js';
import { HUD, Shop, spawnFloatingNumber, hideHintOnce } from './ui.js';

const PI = window.PIXI;

async function boot() {
  // --- Pixi app ------------------------------------------------
  const app = new PI.Application();
  await app.init({
    background: '#050608',
    width:  window.innerWidth,
    height: window.innerHeight,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    powerPreference: 'high-performance',
  });

  document.getElementById('stage').appendChild(app.canvas);

  // --- Scene + Game --------------------------------------------
  const garage = new Garage(app);
  const game   = new Game();
  const hud    = new HUD(game);
  const shop   = new Shop(game, hud);

  let firstClick = true;
  garage.onFloorClick(({ x, y }) => {
    const v = game.click();
    spawnFloatingNumber(x, y, v);
    hud.bump();
    if (firstClick) { hideHintOnce(); firstClick = false; }
  });

  // surface helpful APIs in dev console
  window.__game = game;
  window.__garage = garage;
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6680;padding:24px;font:14px monospace">
    Erreur de démarrage : ${err && err.message ? err.message : err}
  </pre>`;
});
