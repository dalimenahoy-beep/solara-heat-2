// people.js — the human beings of Solara Bay: the player's character (a
// box-built figure with a walk cycle and a punch) and the pedestrians who
// stroll the sidewalks, flee trouble and, if they see a crime, become the
// witnesses the police system counts.
import * as THREE from 'three';
import { CITY, PLAYER } from './config.js';
import { clamp, lerpAngle, dist2d } from './random.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac];
const SHIRTS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0xfd79a8, 0x1abc9c];
const PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x6e5100];

export function makePerson(rng, shirtColor) {
  const person = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor ?? rng.pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  person.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  person.add(head);
  const limbs = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(side * 0.16, 0.72, 0);
    person.add(leg);
    limbs[side < 0 ? 'legL' : 'legR'] = leg;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.18), shirt);
    arm.geometry.translate(0, -0.3, 0);
    arm.position.set(side * 0.4, 1.38, 0);
    person.add(arm);
    limbs[side < 0 ? 'armL' : 'armR'] = arm;
  }
  person.userData.limbs = limbs;
  return person;
}

function poseWalk(person, phase, amount) {
  const limbs = person.userData.limbs;
  if (!limbs) return;
  const s = Math.sin(phase) * 0.55 * amount;
  limbs.legL.rotation.x = s;
  limbs.legR.rotation.x = -s;
  limbs.armL.rotation.x = -s * 0.8;
  limbs.armR.rotation.x = s * 0.8;
}

export function createPeople(scene, world, rng) {
  const playerMesh = makePerson(rng, 0x14b8a6);
  scene.add(playerMesh);
  const player = {
    mesh: playerMesh, x: 0, z: 0, heading: 0, health: PLAYER.health,
    inCar: null, walkPhase: 0, punchT: 0, hurtCd: 0, moving: false,
  };

  const peds = [];
  function spawnPed(anywhere) {
    const mesh = makePerson(rng);
    scene.add(mesh);
    const ped = {
      mesh, x: 0, z: 0, heading: rng.range(0, Math.PI * 2),
      tx: 0, tz: 0, state: 'walk', timer: rng.range(0, 3), walkPhase: rng.range(0, 6),
      speed: rng.range(1.1, 1.7), cashDropped: false,
    };
    placePed(ped, anywhere);
    peds.push(ped);
    return ped;
  }

  function placePed(ped, anywhere) {
    // a sidewalk point: along an avenue, offset to a pavement line
    for (let tries = 0; tries < 20; tries += 1) {
      const vertical = rng.chance(0.5);
      const avenue = rng.pick(CITY.avenues);
      const side = rng.sign() * (CITY.roadHalf + 1.3);
      const along = rng.range(-CITY.edge, CITY.edge - 10);
      const x = vertical ? avenue + side : along;
      const z = vertical ? along : avenue + side;
      if (!anywhere && Math.hypot(x - player.x, z - player.z) < 12) continue;
      ped.x = x;
      ped.z = z;
      ped.state = 'walk';
      ped.timer = 0;
      pickTarget(ped);
      return;
    }
  }

  function pickTarget(ped) {
    // stroll to another pavement point, usually along the same street
    const along = rng.range(-CITY.edge, CITY.edge - 8);
    if (rng.chance(0.6)) {
      ped.tx = ped.x + rng.range(-6, 6);
      ped.tz = along;
    } else {
      ped.tx = along;
      ped.tz = ped.z + rng.range(-6, 6);
    }
    ped.tx = clamp(ped.tx, -CITY.edge - 4, CITY.edge + 4);
    ped.tz = clamp(ped.tz, -CITY.edge - 4, CITY.beachZ + 4);
  }

  for (let i = 0; i < 24; i += 1) spawnPed(true);

  // -- the player, on foot -----------------------------------------------------

  function updatePlayer(dt, input, cameraYaw, cars) {
    if (player.hurtCd > 0) player.hurtCd -= dt;
    if (player.punchT > 0) {
      player.punchT -= dt * 3.2;
      const arm = player.mesh.userData.limbs.armR;
      if (arm) arm.rotation.x = -Math.sin(Math.max(0, player.punchT) * Math.PI) * 1.5;
    }
    const f = input.forward();
    const s = input.strafe();
    player.moving = f !== 0 || s !== 0;
    if (player.moving) {
      const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // forward = (sin, cos); screen-right = (-cos, sin)
      const mx = (sin * f - cos * s);
      const mz = (cos * f + sin * s);
      const len = Math.hypot(mx, mz) || 1;
      const dx = (mx / len) * speed * dt;
      const dz = (mz / len) * speed * dt;
      player.x += dx;
      player.z += dz;
      player.heading = lerpAngle(player.heading, Math.atan2(mx, mz), clamp(dt * 12, 0, 1));
      player.walkPhase += dt * (input.running() ? 11 : 8);
    }
    // keep out of the deep water and inside the world
    player.z = Math.min(player.z, CITY.seaZ + 12);
    player.x = clamp(player.x, -280, 280);
    player.z = Math.max(player.z, -280);
    const pos = { x: player.x, z: player.z };
    world.resolveCollisions(pos, PLAYER.radius);
    player.x = pos.x;
    player.z = pos.z;
    // cars are solid too
    for (const car of cars) {
      if (car.dead) continue;
      const d = dist2d(player.x, player.z, car.x, car.z);
      const min = 1.9;
      if (d > 0.01 && d < min) {
        const push = (min - d);
        player.x += ((player.x - car.x) / d) * push;
        player.z += ((player.z - car.z) / d) * push;
        if (Math.abs(car.speed) > 6 && car.role === 'traffic' && player.hurtCd <= 0) {
          player.health -= 7;
          player.hurtCd = 1;
        }
      }
    }
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    poseWalk(player.mesh, player.walkPhase, player.moving ? 1 : 0);
    if (!player.moving) poseWalk(player.mesh, 0, 0);
  }

  /** Start a punch swing; returns the ped it connects with, if any. */
  function punch() {
    player.punchT = 1;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let best = null;
    let bestD = PLAYER.punchRange;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0.2) {
        best = ped;
        bestD = d;
      }
    }
    if (best) knockDown(best);
    return best;
  }

  function knockDown(ped) {
    ped.state = 'down';
    ped.timer = 7;
    ped.mesh.rotation.x = -Math.PI / 2 + 0.12;
    ped.mesh.position.y = 0.25;
  }

  // -- pedestrians ---------------------------------------------------------------

  function updatePeds(dt, cars, events) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          placePed(ped, false);
        }
        continue;
      }
      // run over?
      for (const car of cars) {
        if (car.dead || Math.abs(car.speed) < 4.5) continue;
        if (dist2d(ped.x, ped.z, car.x, car.z) < 1.7) {
          knockDown(ped);
          events.push({ type: 'runover', ped, car });
          break;
        }
      }
      if (ped.state === 'down') continue;
      // flee from fast cars and trouble
      let fleeX = 0;
      let fleeZ = 0;
      let fleeing = ped.state === 'flee';
      for (const car of cars) {
        if (car.dead) continue;
        const d = dist2d(ped.x, ped.z, car.x, car.z);
        if (d < 6 && Math.abs(car.speed) > 7) {
          fleeX = ped.x - car.x;
          fleeZ = ped.z - car.z;
          fleeing = true;
          ped.timer = 2.2;
        }
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.state = 'walk';
          pickTarget(ped);
          fleeing = false;
        }
      }
      let tx = ped.tx;
      let tz = ped.tz;
      let speed = ped.speed;
      if (fleeing) {
        const l = Math.hypot(fleeX, fleeZ) || 1;
        tx = ped.x + (fleeX / l) * 14;
        tz = ped.z + (fleeZ / l) * 14;
        speed = 4.6;
      } else if (dist2d(ped.x, ped.z, tx, tz) < 1.2) {
        pickTarget(ped);
        tx = ped.tx;
        tz = ped.tz;
      }
      const want = Math.atan2(tx - ped.x, tz - ped.z);
      ped.heading = lerpAngle(ped.heading, want, clamp(dt * 6, 0, 1));
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      const pos = { x: ped.x, z: ped.z };
      world.resolveCollisions(pos, 0.5);
      ped.x = pos.x;
      ped.z = pos.z;
      ped.walkPhase += dt * (fleeing ? 12 : 7);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      poseWalk(ped.mesh, ped.walkPhase, 1);
    }
  }

  /** Nearby standing peds — the witness pool for crimes. */
  function witnessesNear(x, z, radius) {
    let count = 0;
    for (const ped of peds) {
      if (ped.state !== 'down' && dist2d(x, z, ped.x, ped.z) < radius) count += 1;
    }
    return count;
  }

  function setPlayerPos(x, z, heading) {
    player.x = x;
    player.z = z;
    player.heading = heading;
    player.mesh.position.set(x, 0, z);
    player.mesh.rotation.y = heading;
  }

  return { player, peds, updatePlayer, updatePeds, punch, witnessesNear, setPlayerPos };
}
