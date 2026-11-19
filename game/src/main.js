// main.js — SOLARA HEAT's boot and heartbeat. It builds the city and every
// system, owns the top-level state (title / play / pause / busted / wasted),
// runs the fixed-step simulation, wires crimes from every system into the
// police heat model, and keeps the camera, HUD and save in step.
//
// ?seed=N fixes the city layout. ?shot=cover|foot|mission|marina stages a
// screenshot scene through shots.js and sets window.__shotReady once it has
// played a few seconds.
import * as THREE from 'three';
import { CITY, ECONOMY, HEAT, PLACES, PLAYER } from './config.js';
import { makeRng, clamp, lerpAngle, dist2d } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createCarSystem } from './cars.js';
import { createPeople } from './people.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, storeSave } from './save.js';
import { applyShot } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Date.now() % 2147483647);
const rng = makeRng(seed);

// -- three.js stage ------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// -- systems ---------------------------------------------------------------------
const world = createWorld(scene, rng);
const cars = createCarSystem(scene, world, rng);
const people = createPeople(scene, world, rng);
const police = createPolice(cars, world, rng);
const missions = createMissions(scene, rng);
const input = createInput();
const audio = createAudio();
const hud = createHud();
const status = document.getElementById('status');
const hurtFlash = document.getElementById('hurt');

const G = {
  mode: 'title',
  time: 0,
  money: ECONOMY.startMoney,
  playerCar: null,
  cameraYaw: Math.PI,
  camPos: new THREE.Vector3(0, 30, 60),
  lastHealth: PLAYER.health,
  hurtCalm: 0,
  crimeCd: 0,
  world, cars, people, police, missions,
};
people.setPlayerPos(world.spawn.x, world.spawn.z, world.spawn.heading);

// -- save / flow -------------------------------------------------------------------

function persist() {
  storeSave({
    money: Math.round(G.money),
    storyIndex: missions.state.storyDone ? 5 : missions.state.storyIndex,
    totalEarned: missions.state.totalEarned,
  });
}

function refreshTitleSave() {
  const save = loadSave();
  if (save) {
    hud.els.continueBtn.style.display = '';
    hud.els.saveInfo.textContent = `Saved run: $${save.money.toLocaleString('en-US')} · story ${Math.min(save.storyIndex, 5)}/5 · $${save.totalEarned.toLocaleString('en-US')} earned`;
  } else {
    hud.els.continueBtn.style.display = 'none';
    hud.els.saveInfo.textContent = '';
  }
}

function startRun(fromSave) {
  police.clearHeat();
  people.player.health = PLAYER.health;
  people.player.inCar = null;
  people.player.mesh.visible = true;
  if (G.playerCar) {
    G.playerCar.role = 'parked';
    G.playerCar = null;
  }
  people.setPlayerPos(world.spawn.x, world.spawn.z, world.spawn.heading);
  G.cameraYaw = world.spawn.heading;
  G.camPos.set(world.spawn.x - Math.sin(G.cameraYaw) * 8, 3.4, world.spawn.z - Math.cos(G.cameraYaw) * 8);
  if (fromSave) {
    G.money = fromSave.money;
    missions.state.totalEarned = fromSave.totalEarned;
    missions.startAt(fromSave.storyIndex);
  } else {
    G.money = ECONOMY.startMoney;
    missions.state.totalEarned = 0;
    missions.startAt(0);
  }
  G.mode = 'play';
  hud.showScreen('play');
  const m = missions.currentMission();
  if (m) hud.banner(m.title, m.text);
  else hud.banner('Free Roam', 'The city is yours.');
  status.textContent = 'Playing SOLARA HEAT.';
  persist();
}

function endRun(kind) {
  G.mode = 'end';
  audio.engine(false, 0);
  audio.siren(false);
  audio.radio(false);
  let fine = 0;
  let where;
  let label;
  if (kind === 'busted') {
    fine = ECONOMY.bustedFineBase + ECONOMY.bustedFinePerStar * police.heat.stars;
    where = PLACES.precinct;
    label = 'The SBPD got you.';
    audio.busted();
    missions.notify('busted', []);
  } else {
    fine = ECONOMY.wastedFine;
    where = PLACES.hospital;
    label = 'You woke up at Solara General.';
    audio.fail();
    missions.notify('wasted', []);
  }
  fine = Math.min(fine, Math.max(0, Math.round(G.money)));
  G.money -= fine;
  G.endRespawn = { x: where.x + 13, z: where.z + 12 };
  hud.endScreen(kind, `${label} Fine: $${fine}. Cash left: $${Math.round(G.money)}.`);
  status.textContent = kind === 'busted' ? 'Busted.' : 'Wasted.';
  persist();
}

function respawn() {
  police.clearHeat();
  people.player.health = PLAYER.health;
  if (G.playerCar) {
    G.playerCar.role = 'parked';
    G.playerCar.speed = 0;
    G.playerCar = null;
  }
  people.player.inCar = null;
  people.player.mesh.visible = true;
  people.setPlayerPos(G.endRespawn.x, G.endRespawn.z, Math.PI);
  G.mode = 'play';
  hud.showScreen('play');
}

// -- cars: getting in and out --------------------------------------------------------

function nearestCar(maxDist) {
  const p = people.player;
  let best = null;
  let bestD = maxDist;
  for (const car of cars.cars) {
    if (car.dead) continue;
    const d = dist2d(p.x, p.z, car.x, car.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function enterCar(car) {
  const events = [];
  const wasRole = car.role;
  if (G.playerCar && G.playerCar !== car) G.playerCar.role = 'parked';
  car.role = 'player';
  car.occupied = true;
  G.playerCar = car;
  people.player.inCar = car;
  people.player.mesh.visible = false;
  audio.door();
  if (audio.radioEnabled()) audio.radio(true);
  const witnesses = people.witnessesNear(car.x, car.z, HEAT.witnessRadius);
  if (wasRole === 'traffic') {
    police.reportCrime('carjack', car.x, car.z, witnesses);
    hud.toast(witnesses > 0 ? 'Carjacked — and seen.' : 'Carjacked. Nobody saw.');
  } else if (wasRole === 'parked') {
    if (witnesses > 0) {
      police.reportCrime('stealWitnessed', car.x, car.z, witnesses);
      hud.toast('You were seen taking that car.');
    }
  }
  missions.notify('enteredCar', events);
  handleMissionEvents(events);
}

function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  car.role = 'parked';
  car.speed = 0;
  G.playerCar = null;
  people.player.inCar = null;
  people.player.mesh.visible = true;
  const side = car.heading + Math.PI / 2;
  people.setPlayerPos(car.x + Math.sin(side) * 2.2, car.z + Math.cos(side) * 2.2, car.heading);
  audio.door();
  audio.radio(false);
  audio.engine(false, 0);
}

// -- mission + economy events ---------------------------------------------------------

function handleMissionEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'mission-complete':
        G.money += ev.reward;
        hud.banner(`${ev.title} — Complete`, `+$${ev.reward}`);
        audio.sting();
        persist();
        break;
      case 'mission-start':
        hud.banner(ev.title, ev.text);
        break;
      case 'mission-fail':
        hud.toast(`${ev.title} failed: ${ev.why} Try again.`);
        audio.fail();
        break;
      case 'mission-note':
        hud.toast(ev.text);
        break;
      case 'story-done':
        hud.toast('Story complete. Cab work is open — fares pay by distance.');
        break;
      case 'pickup-cash':
        G.money += ev.amount;
        audio.cash();
        break;
      case 'fare':
        G.money += ev.amount;
        hud.toast(`Fare paid: +$${ev.amount}`);
        audio.cash();
        persist();
        break;
      case 'crime':
        police.reportCrime(ev.kind, ev.x, ev.z, 6);
        police.setStarsAtLeast(3);
        break;
      case 'draw-heat':
        police.setStarsAtLeast(ev.stars);
        break;
      default:
        break;
    }
  }
}

// -- the fixed-step simulation -----------------------------------------------------------

function focusOf() {
  const p = people.player;
  if (p.inCar) return { x: p.inCar.x, z: p.inCar.z, speed: p.inCar.speed, onFoot: false };
  return { x: p.x, z: p.z, speed: 0, onFoot: true };
}

function step(dt) {
  G.time += dt;
  if (G.crimeCd > 0) G.crimeCd -= dt;
  const player = people.player;
  const focus = focusOf();

  if (input.take('pause') && G.mode === 'play') {
    G.mode = 'pause';
    hud.showScreen('pause');
    return;
  }
  if (input.take('mute')) hud.toast(audio.toggleMute() ? 'Sound off (M)' : 'Sound on (M)');
  if (input.take('radio') && player.inCar) {
    const on = audio.toggleRadio();
    audio.radio(on);
    hud.toast(on ? 'Radio on (N)' : 'Radio off (N)');
  }
  if (input.take('interact')) {
    if (player.inCar) {
      if (Math.abs(player.inCar.speed) < 3) exitCar();
    } else {
      const car = nearestCar(PLAYER.enterRange);
      if (car) enterCar(car);
    }
  }
  if (input.take('punch') && !player.inCar) {
    const hit = people.punch();
    audio.punch();
    if (hit) {
      const witnesses = people.witnessesNear(hit.x, hit.z, HEAT.witnessRadius);
      police.reportCrime('punch', hit.x, hit.z, witnesses);
      if (!hit.cashDropped && rng.chance(0.55)) {
        hit.cashDropped = true;
        const cash = rng.int(5, 25);
        G.money += cash;
        hud.toast(`Took $${cash} off them.`);
        audio.cash();
      }
    }
  }

  // drive or walk (screenshot scenes may cruise the staged car on their own)
  let driveEvents = null;
  if (player.inCar) {
    const driveInput = G.shotCruise
      ? { forward: () => (player.inCar.speed < 15 ? 1 : 0), strafe: () => 0, braking: () => false }
      : input;
    driveEvents = cars.drivePlayerCar(player.inCar, dt, driveInput, world);
    player.x = player.inCar.x;
    player.z = player.inCar.z;
    if (driveEvents.prop && G.crimeCd <= 0) {
      police.reportCrime('hitProp', player.inCar.x, player.inCar.z, people.witnessesNear(player.inCar.x, player.inCar.z, HEAT.witnessRadius));
      audio.crash(false);
      G.crimeCd = 0.7;
    }
    if (driveEvents.crash === 2) {
      audio.crash(true);
      if (player.inCar.speed !== 0 || true) player.health -= 4;
      G.hurtCalm = 0;
    } else if (driveEvents.crash === 1) {
      audio.crash(false);
    }
    audio.engine(true, Math.abs(player.inCar.speed) / 30);
  } else {
    people.updatePlayer(dt, input, G.cameraYaw, cars.cars);
    audio.engine(false, 0);
  }

  cars.updateTraffic(dt, focus);
  const contacts = cars.resolveCarContacts(G.playerCar);
  for (const hit of contacts) {
    audio.crash(hit.hard);
    if (G.crimeCd <= 0 && hit.other.role !== 'cop') {
      police.reportCrime('hitCar', G.playerCar.x, G.playerCar.z, people.witnessesNear(G.playerCar.x, G.playerCar.z, HEAT.witnessRadius));
      G.crimeCd = 0.8;
    }
    if (hit.hard) {
      player.health -= 3;
      G.hurtCalm = 0;
    }
  }

  const pedEvents = [];
  people.updatePeds(dt, cars.cars, pedEvents);
  for (const ev of pedEvents) {
    if (ev.type === 'runover') {
      audio.crash(false);
      if (ev.car === G.playerCar) {
        police.reportCrime('runOver', ev.ped.x, ev.ped.z, people.witnessesNear(ev.ped.x, ev.ped.z, HEAT.witnessRadius));
        hud.toast('You ran someone down!');
      }
    }
  }

  const policeEvents = police.update(dt, focusOf(), G.time);
  audio.siren(police.heat.stars > 0 && policeEvents.anyClose);
  if (policeEvents.busted && G.mode === 'play') {
    endRun('busted');
    return;
  }

  const missionEvents = [];
  const ctx = {
    playerPos: focusOf(),
    inCar: Boolean(player.inCar),
    carSpeed: player.inCar ? player.inCar.speed : 0,
    stars: police.heat.stars,
    time: G.time,
  };
  missions.update(dt, ctx, missionEvents);
  handleMissionEvents(missionEvents);

  // health: slow recovery once things calm down
  G.hurtCalm += dt;
  if (player.health > 0 && player.health < PLAYER.health && G.hurtCalm > 5) {
    player.health = Math.min(PLAYER.health, player.health + 2.2 * dt);
  }
  if (player.health < G.lastHealth) hurtFlash.style.opacity = '1';
  else hurtFlash.style.opacity = '0';
  G.lastHealth = player.health;
  if (player.health <= 0 && G.mode === 'play') {
    endRun('wasted');
    return;
  }

  world.update(dt, G.time);
  // keep the sun (and its shadows) centred on the action
  const f = focusOf();
  world.sun.position.set(f.x + 60, 110, f.z + 40);
  world.sun.target.position.set(f.x, 0, f.z);
  world.sun.target.updateMatrixWorld();
}

// -- camera --------------------------------------------------------------------------------

let dragLook = null;
canvas.addEventListener('pointerdown', (e) => { dragLook = { x: e.clientX }; audio.unlock(); });
window.addEventListener('pointermove', (e) => {
  if (!dragLook) return;
  G.cameraYaw -= (e.clientX - dragLook.x) * 0.005;
  dragLook.x = e.clientX;
});
window.addEventListener('pointerup', () => { dragLook = null; });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

function updateCamera(dt) {
  const player = people.player;
  let target;
  let dist;
  let height;
  let desiredYaw;
  if (G.mode === 'title') {
    const t = G.time * 0.05;
    target = new THREE.Vector3(Math.sin(t) * 30, 0, Math.cos(t) * 30 - 10);
    camera.position.set(target.x + Math.sin(t + 2.2) * 55, 34, target.z + Math.cos(t + 2.2) * 55);
    camera.lookAt(target.x, 4, target.z);
    return;
  }
  if (player.inCar) {
    const car = player.inCar;
    desiredYaw = car.heading;
    if (!dragLook) G.cameraYaw = lerpAngle(G.cameraYaw, desiredYaw, clamp(dt * 2.6, 0, 1));
    target = new THREE.Vector3(car.x, 1.2, car.z);
    dist = 10.5 + Math.abs(car.speed) * 0.12;
    height = 3.8;
    const targetFov = 62 + clamp(Math.abs(car.speed) / 30, 0, 1) * 9;
    if (Math.abs(camera.fov - targetFov) > 0.15) {
      camera.fov += (targetFov - camera.fov) * clamp(dt * 3, 0, 1);
      camera.updateProjectionMatrix();
    }
  } else {
    target = new THREE.Vector3(player.x, 1.5, player.z);
    desiredYaw = G.cameraYaw;
    dist = 7.6;
    height = 3.1;
    if (Math.abs(camera.fov - 62) > 0.15) {
      camera.fov += (62 - camera.fov) * clamp(dt * 3, 0, 1);
      camera.updateProjectionMatrix();
    }
  }
  const back = new THREE.Vector3(
    target.x + Math.sin(G.cameraYaw) * -dist * Math.cos(0.32),
    target.y + height + dist * Math.sin(0.32) * 0.4,
    target.z + Math.cos(G.cameraYaw) * -dist * Math.cos(0.32),
  );
  G.camPos.lerp(back, clamp(dt * 7, 0, 1));
  if (G.camPos.y < 1.6) G.camPos.y = 1.6;
  camera.position.copy(G.camPos);
  camera.lookAt(target.x, target.y + 0.6, target.z);
}

// -- HUD sync ---------------------------------------------------------------------------------

function syncHud() {
  const player = people.player;
  const obj = missions.objective();
  const focus = focusOf();
  let prompt = '';
  if (G.mode === 'play') {
    if (player.inCar) {
      if (Math.abs(player.inCar.speed) < 3) prompt = '<b>E</b> Exit car';
    } else if (nearestCar(PLAYER.enterRange)) {
      prompt = '<b>E</b> Enter car';
    } else {
      for (const ped of people.peds) {
        if (ped.state !== 'down' && dist2d(player.x, player.z, ped.x, ped.z) < PLAYER.punchRange + 0.4) {
          prompt = '<b>F</b> Punch';
          break;
        }
      }
    }
  }
  hud.update({
    money: G.money,
    stars: police.heat.stars,
    health: player.health,
    speed: player.inCar ? player.inCar.speed : 0,
    inCar: Boolean(player.inCar),
    objective: obj,
    playerPos: focus,
    arrest: police.heat.arrest,
    prompt,
  });
  hud.drawMinimap({
    player: { x: focus.x, z: focus.z, heading: player.inCar ? player.inCar.heading : player.heading },
    cops: police.cops.filter((c) => !c.dead),
    traffic: cars.cars.filter((c) => c.role === 'traffic' && !c.dead).slice(0, 18),
    objective: obj,
    passenger: null,
    time: G.time,
  });
}

// -- boot + the loop ------------------------------------------------------------------------------

hud.els.continueBtn.addEventListener('click', () => { audio.unlock(); startRun(loadSave()); });
document.getElementById('btn-play').addEventListener('click', () => { audio.unlock(); startRun(null); });
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'play';
  hud.showScreen('play');
});
document.getElementById('btn-again').addEventListener('click', () => respawn());
refreshTitleSave();
window.__solara = G; // a handle for screenshot staging and automated checks

if (shotName) {
  G.mode = 'play';
  hud.showScreen('play');
  applyShot(G, shotName);
  const focus = focusOf();
  G.camPos.set(focus.x - Math.sin(G.cameraYaw) * 10, 4, focus.z - Math.cos(G.cameraYaw) * 10);
} else {
  hud.showScreen('title');
}

let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  if (G.mode === 'play') {
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      if (G.mode !== 'play') { accumulator = 0; break; }
    }
  } else if (G.mode === 'title') {
    // the city idles behind the title: traffic rolls, peds stroll
    while (accumulator >= STEP) {
      G.time += STEP;
      cars.updateTraffic(STEP, { x: 0, z: 0 });
      const ev = [];
      people.updatePeds(STEP, cars.cars, ev);
      world.update(STEP, G.time);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
    if (G.mode === 'pause' && input.take('pause')) {
      G.mode = 'play';
      hud.showScreen('play');
    }
  }
  updateCamera(Math.min(0.05, accumulator + STEP));
  if (G.mode === 'play' || G.mode === 'pause') syncHud();
  renderer.render(scene, camera);
  if (shotName && G.time > 2.4) window.__shotReady = true;
}
requestAnimationFrame(frame);
