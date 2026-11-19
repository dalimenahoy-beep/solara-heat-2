// cars.js — the vehicle factory (five body styles plus the police livery),
// the traffic system that lane-drives the city, parked cars waiting to be
// borrowed, and the arcade driving physics the player uses. A car is a plain
// object: mesh, heading, speed, damage and a role ('traffic', 'parked',
// 'cop', or whichever car the player is sitting in).
import * as THREE from 'three';
import { CITY, CAR_TUNING } from './config.js';
import { clamp, lerp, lerpAngle } from './random.js';

const PAINT = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x95a5a6, 0xe67e22, 0x9b59b6, 0x1abc9c, 0xfd79a8];
const STYLES = ['sedan', 'hatch', 'pickup', 'van', 'sport'];

const smokeTexture = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(60,60,60,0.55)');
    grad.addColorStop(1, 'rgba(60,60,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

export function makeCarMesh(style, colorHex) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const trim = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const dims = {
    sedan: { len: 4.3, wid: 1.9, h: 0.62, cabLen: 2.1, cabH: 0.55 },
    hatch: { len: 3.8, wid: 1.85, h: 0.66, cabLen: 2.2, cabH: 0.6 },
    pickup: { len: 4.7, wid: 2.0, h: 0.72, cabLen: 1.5, cabH: 0.62 },
    van: { len: 4.9, wid: 2.05, h: 1.05, cabLen: 3.6, cabH: 0.85 },
    sport: { len: 4.4, wid: 1.95, h: 0.5, cabLen: 1.8, cabH: 0.42 },
    cop: { len: 4.5, wid: 1.95, h: 0.62, cabLen: 2.1, cabH: 0.55 },
  }[style] || { len: 4.3, wid: 1.9, h: 0.62, cabLen: 2.1, cabH: 0.55 };

  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.wid, dims.h, dims.len), paint);
  body.position.y = 0.35 + dims.h / 2;
  body.castShadow = true;
  car.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.86, dims.cabH, dims.cabLen), style === 'cop' ? paint : glass);
  cab.position.set(0, 0.35 + dims.h + dims.cabH / 2 - 0.04, style === 'pickup' ? -dims.len * 0.18 : -0.1);
  cab.castShadow = true;
  car.add(cab);
  if (style === 'cop') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims.wid + 0.02, 0.3, dims.len * 0.98), trim);
    stripe.position.y = 0.62;
    car.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 0.35 + dims.h + dims.cabH + 0.08, -0.1);
    bar.name = 'lightbar';
    car.add(bar);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), lightMat);
    head.position.set(sx * dims.wid * 0.32, 0.62, dims.len / 2 + 0.01);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tail.position.set(sx * dims.wid * 0.32, 0.66, -dims.len / 2 - 0.01);
    car.add(tail);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (dims.wid / 2 - 0.05), 0.36, sz * (dims.len / 2 - 0.85));
      car.add(wheel);
      wheels.push({ mesh: wheel, front: sz > 0 });
    }
  }
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, opacity: 0 }));
  smoke.scale.set(1.6, 1.6, 1);
  smoke.position.set(0, 1.5, dims.len * 0.3);
  smoke.name = 'smoke';
  car.add(smoke);
  car.userData.wheels = wheels;
  car.userData.dims = dims;
  return car;
}

function baseCar(scene, style, colorHex, x, z, heading, role) {
  const mesh = makeCarMesh(style, colorHex);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, style, heading, speed: 0, steer: 0,
    x, z, role, damage: 0, occupied: role === 'traffic',
    axis: 'x', dir: 1, lane: 0, cruise: 11, turnBlend: 0, honkT: 0,
    dead: false, crashCd: 0,
  };
}

/** Heading for travelling along `axis` in direction `dir`. */
export function headingFor(axis, dir) {
  return axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
}

/** The lane centre coordinate for a car on `avenue` travelling axis/dir. */
function laneFor(axis, dir, avenue) {
  if (axis === 'x') return avenue + (dir > 0 ? CITY.laneOffset : -CITY.laneOffset);
  return avenue + (dir > 0 ? -CITY.laneOffset : CITY.laneOffset);
}

export function createCarSystem(scene, world, rng) {
  const cars = [];

  function spawnTraffic(focus) {
    // pick an avenue point 60–130m from the focus, on a lane
    for (let tries = 0; tries < 12; tries += 1) {
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const avenue = rng.pick(CITY.avenues);
      const dir = rng.sign();
      const along = rng.range(-CITY.edge, CITY.edge);
      const lane = laneFor(axis, dir, avenue);
      const x = axis === 'x' ? along : lane;
      const z = axis === 'x' ? lane : along;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < 55 || d > 150) continue;
      const car = baseCar(scene, rng.pick(STYLES), rng.pick(PAINT), x, z, headingFor(axis, dir), 'traffic');
      car.axis = axis;
      car.dir = dir;
      car.lane = lane;
      car.cruise = rng.range(9, 13.5);
      cars.push(car);
      return car;
    }
    return null;
  }

  function spawnParked() {
    for (let i = 0; i < 30; i += 1) {
      const vertical = rng.chance(0.5);
      const avenue = rng.pick(CITY.avenues);
      const side = rng.sign();
      const along = rng.range(-CITY.edge + 8, CITY.edge - 8);
      const off = side * (CITY.roadHalf - 1.7);
      const x = vertical ? avenue + off : along;
      const z = vertical ? along : avenue + off;
      if (world.surfaceAt(x, z) !== 'road') continue;
      // face along the road, nose with traffic on that side
      const heading = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = baseCar(scene, rng.pick(STYLES), rng.pick(PAINT), x, z, heading, 'parked');
      car.occupied = false;
      cars.push(car);
    }
  }

  function addCar(car) {
    cars.push(car);
    return car;
  }

  function makeCop(x, z) {
    const car = baseCar(scene, 'cop', 0xf4f6f6, x, z, 0, 'cop');
    car.occupied = true;
    return addCar(car);
  }

  // -- traffic ----------------------------------------------------------------

  function carAhead(car, all) {
    let nearest = Infinity;
    for (const other of all) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < nearest && side < 2.2) nearest = ahead;
    }
    return nearest;
  }

  function updateTraffic(dt, focus) {
    let trafficCount = 0;
    for (const car of cars) {
      if (car.role === 'traffic' && !car.dead) trafficCount += 1;
    }
    for (const car of cars) {
      if (car.dead) continue;
      syncMesh(car, dt);
      if (car.role !== 'traffic') continue;
      // respawn strays near the action
      const dFocus = Math.hypot(car.x - focus.x, car.z - focus.z);
      if (dFocus > 175) {
        const fresh = spawnTraffic(focus);
        if (fresh) {
          car.x = fresh.x; car.z = fresh.z; car.axis = fresh.axis; car.dir = fresh.dir;
          car.lane = fresh.lane; car.heading = fresh.heading; car.speed = 0;
          cars.splice(cars.indexOf(fresh), 1);
          scene.remove(fresh.mesh);
        }
        continue;
      }
      const ahead = carAhead(car, cars);
      let target = car.cruise;
      if (ahead < 10) target = Math.min(target, Math.max(0, (ahead - 5) * 1.6));
      if (car.turnBlend > 0) target = Math.min(target, 6.5);
      car.speed = lerp(car.speed, target, clamp(dt * (target < car.speed ? 5 : 1.6), 0, 1));
      // advance along the current axis
      const along = car.axis === 'x' ? car.x : car.z;
      const step = car.dir * car.speed * dt;
      if (car.axis === 'x') car.x += step; else car.z += step;
      // crossing an intersection? maybe turn
      const crossCoord = car.axis === 'x' ? car.x : car.z;
      for (const av of CITY.avenues) {
        if (Math.abs(crossCoord - av) < Math.abs(step) + 0.01 && car.turnBlend <= 0 && Math.abs((car.axis === 'x' ? car.z : car.x) - car.lane) < 0.6) {
          if (rng.chance(0.34)) {
            const newAxis = car.axis === 'x' ? 'z' : 'x';
            const newDir = rng.sign();
            car.axis = newAxis;
            car.dir = newDir;
            car.lane = laneFor(newAxis, newDir, av);
            car.turnBlend = 1;
          }
          break;
        }
      }
      // blend toward the lane centre on the cross axis
      if (car.axis === 'x') car.z = lerp(car.z, car.lane, clamp(dt * 2.2, 0, 1));
      else car.x = lerp(car.x, car.lane, clamp(dt * 2.2, 0, 1));
      if (car.turnBlend > 0) car.turnBlend = Math.max(0, car.turnBlend - dt * 1.4);
      car.heading = lerpAngle(car.heading, headingFor(car.axis, car.dir), clamp(dt * 4, 0, 1));
      const pos = { x: car.x, z: car.z };
      if (world.resolveCollisions(pos, CAR_TUNING.radius)) {
        car.x = pos.x;
        car.z = pos.z;
        car.speed = Math.min(car.speed, 2);
      } else {
        car.x = pos.x;
        car.z = pos.z;
      }
    }
    if (trafficCount < 13) spawnTraffic(focus);
  }

  // -- shared visuals -----------------------------------------------------------

  function syncMesh(car, dt) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels;
    if (wheels) {
      for (const w of wheels) {
        w.mesh.rotation.x += (car.speed * dt) / 0.36;
        if (w.front) w.mesh.rotation.y = car.steer * 0.9;
      }
    }
    const smoke = car.mesh.getObjectByName('smoke');
    if (smoke) {
      const dmg = clamp(car.damage / 100, 0, 1);
      smoke.material.opacity = dmg > 0.35 ? (dmg - 0.35) * 0.9 : 0;
      const s = 1.3 + dmg * 1.6 + Math.sin(performance.now() * 0.02 + car.x) * 0.15;
      smoke.scale.set(s, s, 1);
    }
    if (car.crashCd > 0) car.crashCd -= dt;
  }

  // -- player driving -------------------------------------------------------------

  /**
   * Advance the car the player is driving one step. Returns events:
   * { crash: 0 none | 1 soft | 2 hard, prop: true if a street prop fell }.
   */
  function drivePlayerCar(car, dt, input, worldRef) {
    const events = { crash: 0, prop: false };
    const t = CAR_TUNING;
    const surface = worldRef.surfaceAt(car.x, car.z);
    const surfFactor = surface === 'sand' ? 0.55 : surface === 'water' ? 0 : 1;
    const maxSpeed = 30 * surfFactor + 4;
    const fwd = input.forward();
    const steerIn = input.strafe();

    car.steer = lerp(car.steer, steerIn * t.steerMax * (1 - clamp(Math.abs(car.speed) / 46, 0, 0.45)), clamp(dt * 9, 0, 1));
    if (fwd > 0) car.speed += t.accel * surfFactor * dt * (1 - clamp(car.speed / (maxSpeed + 12), 0, 1));
    else if (fwd < 0) {
      if (car.speed > 0.6) car.speed -= t.brake * dt;
      else car.speed = Math.max(car.speed - t.accel * 0.6 * dt, -t.reverseMax);
    }
    if (input.braking()) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 34 * dt);
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    }
    car.speed -= car.speed * t.drag * dt * 0.35;
    if (fwd === 0) car.speed -= car.speed * 1.1 * dt;
    car.speed = clamp(car.speed, -t.reverseMax, maxSpeed);

    if (Math.abs(car.speed) > 0.3) {
      // heading grows toward the car's left, so a right steer subtracts
      const turn = car.steer * 2.1 * clamp(car.speed / 9, -1, 1) * (input.braking() ? 1.35 : 1);
      car.heading -= turn * dt;
    }
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;

    // the sea is a wall for cars
    if (car.z > CITY.seaZ + 2) {
      car.z = CITY.seaZ + 2;
      if (car.speed > 4) events.crash = Math.max(events.crash, 1);
      car.speed = Math.min(car.speed, 0);
    }
    car.x = clamp(car.x, -260, 260);
    car.z = clamp(car.z, -260, 300);

    const pos = { x: car.x, z: car.z };
    if (worldRef.resolveCollisions(pos, t.radius)) {
      const impact = Math.abs(car.speed);
      car.x = pos.x;
      car.z = pos.z;
      if (impact > 7) {
        events.crash = 2;
        car.damage = clamp(car.damage + impact * 1.1, 0, 100);
        car.speed = -car.speed * 0.22;
      } else if (impact > 2.5) {
        events.crash = 1;
        car.damage = clamp(car.damage + impact * 0.5, 0, 100);
        car.speed = 0;
      } else {
        car.speed = Math.min(car.speed, 0);
      }
    }
    // street props topple
    for (const prop of worldRef.props) {
      if (prop.down) continue;
      const d = Math.hypot(prop.x - car.x, prop.z - car.z);
      if (d < prop.r + t.radius && Math.abs(car.speed) > 3) {
        prop.down = true;
        prop.mesh.rotation.x = 1.35;
        prop.mesh.position.y = 0.25;
        events.prop = true;
        car.damage = clamp(car.damage + 1.5, 0, 100);
      }
    }
    syncMesh(car, dt);
    return events;
  }

  // -- car on car -------------------------------------------------------------------

  /** Push overlapping cars apart; returns crash events involving the player's car. */
  function resolveCarContacts(playerCar) {
    const events = [];
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 3.1;
        if (d === 0 || d >= min) continue;
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (min - d) / 2;
        const aMovable = a !== playerCar || true;
        if (aMovable) { a.x -= nx * overlap; a.z -= nz * overlap; }
        b.x += nx * overlap;
        b.z += nz * overlap;
        const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.4;
        const involvesPlayer = a === playerCar || b === playerCar;
        if (rel > 5 && (a.crashCd <= 0 || b.crashCd <= 0)) {
          a.damage = clamp(a.damage + rel * 0.8, 0, 100);
          b.damage = clamp(b.damage + rel * 0.8, 0, 100);
          const keep = (a.speed + b.speed) / 2;
          a.speed = keep * 0.6;
          b.speed = keep * 0.6;
          a.crashCd = 0.5;
          b.crashCd = 0.5;
          if (involvesPlayer) events.push({ hard: rel > 11, other: a === playerCar ? b : a });
        } else if (involvesPlayer && Math.abs(playerCar.speed) > 3) {
          events.push({ hard: false, other: a === playerCar ? b : a, soft: true });
        }
      }
    }
    return events;
  }

  spawnParked();

  return {
    cars,
    addCar,
    makeCop,
    spawnTraffic,
    updateTraffic,
    drivePlayerCar,
    resolveCarContacts,
    syncMesh,
    trafficCount: () => cars.filter((c) => c.role === 'traffic' && !c.dead).length,
  };
}
