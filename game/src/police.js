// police.js — the wanted system: crimes reported here become heat points,
// scaled by how many witnesses saw them; points hold a star level; the level
// decides how many SBPD cars hunt the player and how hard. Cop cars steer a
// simple pursuit, and standing close to a stopped player fills the arrest
// meter that ends in BUSTED.
import { CITY, COPS, CRIME, HEAT } from './config.js';
import { clamp, lerpAngle, dist2d } from './random.js';

export function createPolice(carSystem, world, rng) {
  const heat = {
    points: 0,
    stars: 0,
    unseen: 0,
    arrest: 0,
    lastCrimeAt: -99,
  };
  const cops = [];

  function starsFor(points) {
    let stars = 0;
    for (let i = 1; i < HEAT.thresholds.length; i += 1) {
      if (points >= HEAT.thresholds[i]) stars = i;
    }
    return stars;
  }

  /** Report a crime at (x, z). Witnesses scale the heat it draws. */
  function reportCrime(kind, x, z, witnesses) {
    const base = CRIME[kind] || 0;
    if (!base) return;
    const copNear = cops.some((c) => !c.dead && dist2d(x, z, c.x, c.z) < HEAT.witnessRadius + 8);
    const scale = witnesses > 0 || copNear ? 1 : 0.3;
    heat.points = clamp(heat.points + base * scale, 0, 200);
    heat.stars = starsFor(heat.points);
    heat.unseen = 0;
    heat.lastCrimeAt = performance.now() / 1000;
  }

  /** Directly set a star floor (mission scripts use this for set pieces). */
  function setStarsAtLeast(n) {
    const need = HEAT.thresholds[n] || 0;
    if (heat.points < need) heat.points = need;
    heat.stars = starsFor(heat.points);
    heat.unseen = 0;
  }

  function clearHeat() {
    heat.points = 0;
    heat.stars = 0;
    heat.arrest = 0;
    heat.unseen = 0;
  }

  function spawnCop(focus) {
    // a road point at spawn distance, in a random direction
    for (let tries = 0; tries < 10; tries += 1) {
      const avenue = rng.pick(CITY.avenues);
      const vertical = rng.chance(0.5);
      const along = clamp((vertical ? focus.z : focus.x) + rng.sign() * COPS.spawnDistance * rng.range(0.7, 1.15), -CITY.edge, CITY.edge);
      const x = vertical ? avenue : along;
      const z = vertical ? along : avenue;
      if (dist2d(x, z, focus.x, focus.z) < 45) continue;
      const cop = carSystem.makeCop(x, z);
      cop.reverseT = 0;
      cop.stuckT = 0;
      cops.push(cop);
      return cop;
    }
    return null;
  }

  function removeCop(cop) {
    cop.dead = true;
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
    const j = carSystem.cars.indexOf(cop);
    if (j >= 0) carSystem.cars.splice(j, 1);
    cop.mesh.parent?.remove(cop.mesh);
  }

  /**
   * One step of the hunt. `focus` is who the police want: {x, z, speed,
   * onFoot}. Returns { busted } when the arrest meter fills.
   */
  function update(dt, focus, time) {
    const events = { busted: false, anyClose: false };

    // -- who can see the player right now? --------------------------------------
    let seen = false;
    for (const cop of cops) {
      if (!cop.dead && dist2d(focus.x, focus.z, cop.x, cop.z) < 62) seen = true;
    }
    if (seen) heat.unseen = 0;
    else heat.unseen += dt;
    if (heat.stars > 0 && heat.unseen > HEAT.unseenGrace) {
      heat.points = Math.max(0, heat.points - HEAT.decayPerSecond * dt);
      const before = heat.stars;
      heat.stars = starsFor(heat.points);
      if (heat.stars === 0) heat.points = 0;
      if (heat.stars < before) heat.unseen = HEAT.unseenGrace; // keep decaying smoothly
    }

    // -- keep the fleet at the level the stars demand -----------------------------
    const wanted = COPS.maxByStars[heat.stars];
    const alive = cops.filter((c) => !c.dead);
    if (alive.length < wanted) spawnCop(focus);
    for (const cop of alive) {
      if (dist2d(focus.x, focus.z, cop.x, cop.z) > COPS.despawnDistance && heat.stars === 0) removeCop(cop);
    }

    // -- pursuit ------------------------------------------------------------------
    const cap = COPS.speedByStars[heat.stars] || 20;
    let arresting = false;
    for (const cop of cops) {
      if (cop.dead) continue;
      const dx = focus.x - cop.x;
      const dz = focus.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (d < 26) events.anyClose = true;
      const wantHeading = Math.atan2(dx, dz);
      let angleDiff = wantHeading - cop.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (cop.reverseT > 0) {
        cop.reverseT -= dt;
        cop.speed = Math.max(cop.speed - 18 * dt, -8);
      } else {
        const targetSpeed = d < 6 ? Math.min(cap, Math.max(4, d * 1.4)) : cap;
        const accel = targetSpeed > cop.speed ? 11 : 26;
        cop.speed += clamp(targetSpeed - cop.speed, -accel * dt, accel * dt);
        cop.heading = lerpAngle(cop.heading, wantHeading, clamp(dt * (Math.abs(angleDiff) > 1.6 ? 1.4 : 2.6), 0, 1));
      }
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      if (cop.z > CITY.seaZ + 2) {
        cop.z = CITY.seaZ + 2;
        cop.speed = Math.min(cop.speed, 0);
        cop.reverseT = 0.7;
      }
      const pos = { x: cop.x, z: cop.z };
      if (world.resolveCollisions(pos, 1.55)) {
        cop.x = pos.x;
        cop.z = pos.z;
        if (Math.abs(cop.speed) > 4) {
          cop.damage = clamp(cop.damage + Math.abs(cop.speed) * 0.5, 0, 100);
          cop.reverseT = 0.8;
          cop.speed = -cop.speed * 0.2;
        } else {
          cop.speed = 0;
          cop.stuckT += dt;
          if (cop.stuckT > 0.8) {
            cop.reverseT = 0.9;
            cop.stuckT = 0;
          }
        }
      }
      // flash the light bar
      const bar = cop.mesh.getObjectByName('lightbar');
      if (bar) {
        const phase = Math.floor(time * 5 + cop.x) % 2 === 0;
        bar.children[0].material.color.setHex(phase ? 0xff2222 : 0x661111);
        bar.children[1].material.color.setHex(phase ? 0x113366 : 0x2266ff);
      }
      carSystem.syncMesh(cop, dt);

      // arrest pressure: close and the player nearly stopped
      if (d < HEAT.arrestRadius && Math.abs(focus.speed) < 2.2) arresting = true;
      if (cop.damage >= 100 && !cop.dead) {
        cop.dead = true;
        cop.speed = 0;
      }
    }
    if (arresting && heat.stars > 0) {
      heat.arrest += dt / HEAT.arrestFillTime;
      if (heat.arrest >= 1) {
        events.busted = true;
        heat.arrest = 0;
      }
    } else {
      heat.arrest = Math.max(0, heat.arrest - dt * 0.7);
    }
    return events;
  }

  return { heat, cops, reportCrime, setStarsAtLeast, clearHeat, update };
}
