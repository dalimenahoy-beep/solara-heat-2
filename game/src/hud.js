// hud.js — everything the player reads: the phone panel with the current
// objective, money and wanted stars, health and speed, the circular minimap,
// context prompts, toasts and mission banners, plus the title / pause /
// busted / wasted overlays. All DOM, styled by index.html.
import { CITY, PLACES } from './config.js';
import { clamp } from './random.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    hud: $('hud'), phone: $('phone'), objTitle: $('obj-title'), objText: $('obj-text'),
    objMeta: $('obj-meta'), objBar: $('obj-bar'), objFill: $('obj-fill'),
    money: $('money'), stars: $('stars'), healthFill: $('health-fill'),
    speed: $('speed'), prompt: $('prompt'), toasts: $('toasts'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    arrest: $('arrest'), arrestFill: $('arrest-fill'),
    title: $('title-screen'), pause: $('pause-screen'), end: $('end-screen'),
    endTitle: $('end-title'), endText: $('end-text'),
    continueBtn: $('btn-continue'), saveInfo: $('save-info'),
    minimap: $('minimap'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let bannerTimer = null;
  let lastObjectiveKey = '';

  function showScreen(name) {
    els.title.style.display = name === 'title' ? 'flex' : 'none';
    els.pause.style.display = name === 'pause' ? 'flex' : 'none';
    els.end.style.display = name === 'end' ? 'flex' : 'none';
    els.hud.style.display = name === 'play' || name === 'pause' ? 'block' : 'none';
  }

  function toast(text, ms = 3400) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    els.toasts.appendChild(div);
    window.setTimeout(() => div.classList.add('show'), 20);
    window.setTimeout(() => {
      div.classList.remove('show');
      window.setTimeout(() => div.remove(), 400);
    }, ms);
  }

  function banner(title, sub = '') {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.classList.add('show');
    if (bannerTimer) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => els.banner.classList.remove('show'), 2800);
  }

  function endScreen(kind, text) {
    els.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    els.endTitle.style.color = kind === 'busted' ? '#6fb7ff' : '#ff5d5d';
    els.endText.textContent = text;
    showScreen('end');
  }

  function update(state) {
    els.money.textContent = '$' + Math.max(0, Math.round(state.money)).toLocaleString('en-US');
    els.stars.textContent = '★★★★★'.slice(0, state.stars) + '☆☆☆☆☆'.slice(0, 5 - state.stars);
    els.stars.style.opacity = state.stars > 0 ? '1' : '0.25';
    els.healthFill.style.width = clamp(state.health, 0, 100) + '%';
    els.healthFill.style.background = state.health > 35 ? '#39d353' : '#ff5d5d';
    els.speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    els.prompt.innerHTML = state.prompt || '';
    els.prompt.style.opacity = state.prompt ? '1' : '0';

    const obj = state.objective;
    if (obj) {
      const key = obj.title + '|' + obj.text;
      if (key !== lastObjectiveKey) {
        lastObjectiveKey = key;
        els.objTitle.textContent = obj.title;
        els.objText.textContent = obj.text;
      }
      let meta = '';
      if (obj.x !== null && obj.x !== undefined && state.playerPos) {
        const d = Math.hypot(obj.x - state.playerPos.x, obj.z - state.playerPos.z);
        meta = `${Math.round(d)} m`;
      }
      if (obj.timer !== null && obj.timer !== undefined) meta += `${meta ? ' · ' : ''}⏱ ${Math.max(0, Math.ceil(obj.timer))}s`;
      els.objMeta.textContent = meta;
      if (obj.progress !== null && obj.progress !== undefined) {
        els.objBar.style.display = 'block';
        els.objFill.style.width = clamp(obj.progress * 100, 0, 100) + '%';
      } else {
        els.objBar.style.display = 'none';
      }
    }
    if (state.arrest > 0.02) {
      els.arrest.style.display = 'block';
      els.arrestFill.style.width = clamp(state.arrest * 100, 0, 100) + '%';
    } else {
      els.arrest.style.display = 'none';
    }
  }

  // -- minimap -----------------------------------------------------------------
  const MAP_SPAN = 430;
  const MAP_C = { x: 0, z: 35 };
  function mapXY(x, z, size) {
    return [
      size / 2 + ((x - MAP_C.x) / MAP_SPAN) * size,
      size / 2 + ((z - MAP_C.z) / MAP_SPAN) * size,
    ];
  }

  function drawMinimap(view) {
    const size = els.minimap.width;
    const g = mapCtx;
    g.clearRect(0, 0, size, size);
    // land
    g.fillStyle = '#274d2d';
    g.fillRect(0, 0, size, size);
    // beach + sea
    const [, beachY] = mapXY(0, CITY.beachZ, size);
    const [, seaY] = mapXY(0, CITY.seaZ, size);
    g.fillStyle = '#eed9a4';
    g.fillRect(0, beachY, size, seaY - beachY);
    g.fillStyle = '#1d7fa8';
    g.fillRect(0, seaY, size, size - seaY);
    // roads
    g.strokeStyle = '#565d66';
    g.lineWidth = Math.max(2, (CITY.roadHalf * 2 / MAP_SPAN) * size);
    for (const a of CITY.avenues) {
      const [x] = mapXY(a, 0, size);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke();
      const [, y] = mapXY(0, a, size);
      g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke();
    }
    // places
    for (const p of Object.values(PLACES)) {
      const [x, y] = mapXY(p.x, p.z, size);
      g.fillStyle = '#ffd166';
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    // objective
    if (view.objective && view.objective.x !== null && view.objective.x !== undefined) {
      const [x, y] = mapXY(view.objective.x, view.objective.z, size);
      g.strokeStyle = '#ffc93c';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 6 + Math.sin(view.time * 4) * 1.6, 0, Math.PI * 2);
      g.stroke();
    }
    // police blips
    for (const cop of view.cops) {
      const [x, y] = mapXY(cop.x, cop.z, size);
      g.fillStyle = Math.floor(view.time * 3) % 2 ? '#ff4444' : '#4488ff';
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    // traffic dots
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const car of view.traffic) {
      const [x, y] = mapXY(car.x, car.z, size);
      g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    // passenger
    if (view.passenger) {
      const [x, y] = mapXY(view.passenger.x, view.passenger.z, size);
      g.fillStyle = '#f39c12';
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    // player arrow
    const [px, py] = mapXY(view.player.x, view.player.z, size);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 6);
    g.lineTo(-4.4, -5);
    g.lineTo(4.4, -5);
    g.closePath();
    g.fill();
    g.restore();
  }

  return { els, showScreen, toast, banner, endScreen, update, drawMinimap };
}
