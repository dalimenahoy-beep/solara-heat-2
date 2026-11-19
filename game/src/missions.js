// missions.js — the work of Solara Bay: a five-step story chain (steal a car,
// run a hot package, cool down, a timed courier run, and the bank job), then
// endless cab fares. It also scatters the street cash pickups and runs the
// gold objective beacon and the phone data the HUD shows.
import * as THREE from 'three';
import { CAB, ECONOMY, PLACES, STORY } from './config.js';
import { clamp, dist2d } from './random.js';
import { makePerson } from './people.js';

export function createMissions(scene, rng) {
  const state = {
    storyIndex: 0,
    storyDone: false,
    phase: 'main',       // per-mission sub-phase: 'a' | 'b' | 'c'
    timer: null,         // seconds left, or null
    hold: 0,             // robbery hold progress (seconds in the zone)
    armed: false,        // loseheat: has the player been hot enough yet?
    cabPhase: 'offer',   // 'offer' (passenger waiting) | 'ride' | 'cooldown'
    cabTimer: 0,
    fareStart: 0,
    fareDist: 0,
    totalEarned: 0,
  };

  // -- beacon: a column of gold light over the current target -------------------
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 17;
  beacon.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  // -- cash pickups ---------------------------------------------------------------
  const pickupMat = new THREE.MeshBasicMaterial({ color: 0x39d353 });
  const pickups = [];
  function spawnPickup() {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.55), pickupMat);
    scene.add(mesh);
    const p = { mesh, x: 0, z: 0, amount: 0, active: false, spin: rng.range(0, 6) };
    placePickup(p);
    pickups.push(p);
    return p;
  }
  function placePickup(p) {
    const avenue = rng.pick([-112, -56, 0, 56, 112]);
    const along = rng.range(-135, 135);
    p.x = rng.chance(0.5) ? avenue + rng.range(-4, 4) : along;
    p.z = rng.chance(0.5) ? along : avenue + rng.range(-4, 4);
    p.amount = rng.int(ECONOMY.pickupMin, ECONOMY.pickupMax);
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0.7, p.z);
  }
  for (let i = 0; i < 9; i += 1) spawnPickup();

  // -- cab passenger ----------------------------------------------------------------
  let passenger = null;
  function placePassenger(focus) {
    if (!passenger) {
      const mesh = makePerson(rng, 0xf39c12);
      scene.add(mesh);
      passenger = { mesh, x: 0, z: 0, dest: null, boarded: false };
    }
    for (let tries = 0; tries < 14; tries += 1) {
      const avenue = rng.pick([-112, -56, 0, 56, 112]);
      const along = rng.range(-130, 130);
      const x = rng.chance(0.5) ? avenue + 8.6 : along;
      const z = rng.chance(0.5) ? along : avenue + 8.6;
      if (dist2d(x, z, focus.x, focus.z) < 45) continue;
      passenger.x = x;
      passenger.z = z;
      passenger.boarded = false;
      passenger.mesh.visible = true;
      passenger.mesh.position.set(x, 0, z);
      return;
    }
  }

  function currentMission() {
    return state.storyDone ? null : STORY[state.storyIndex];
  }

  function objective() {
    const m = currentMission();
    if (!m) {
      if (state.cabPhase === 'offer' && passenger) {
        return { title: 'Cab Fare', text: 'Pick up the passenger in the yellow shirt.', x: passenger.x, z: passenger.z };
      }
      if (state.cabPhase === 'ride' && passenger?.dest) {
        return { title: 'Cab Fare', text: `Take your passenger to ${passenger.dest.label}.`, x: passenger.dest.x, z: passenger.dest.z };
      }
      return { title: 'Free Roam', text: 'The city is yours. Find cash, dodge the SBPD.', x: null, z: null };
    }
    const from = PLACES[m.from];
    const to = PLACES[m.to || m.escapeTo || m.at];
    switch (m.kind) {
      case 'steal':
        return { title: m.title, text: m.text, x: null, z: null };
      case 'pickup-deliver':
        return state.phase === 'a'
          ? { title: m.title, text: `Pick up the package at the ${from.name}.`, x: from.x, z: from.z }
          : { title: m.title, text: `Deliver it to the ${to.name}.`, x: to.x, z: to.z, timer: state.timer };
      case 'loseheat':
        return state.armed
          ? { title: m.title, text: 'Break their line of sight and stay hidden.', x: null, z: null }
          : { title: m.title, text: `Get ${m.minStars} stars of attention first — then lose them.`, x: null, z: null };
      case 'timed-drive':
        return { title: m.title, text: m.text, x: to.x, z: to.z, timer: state.timer };
      case 'robbery':
        if (state.phase === 'a') return { title: m.title, text: `Go to the ${to.name}.`, x: to.x, z: to.z };
        if (state.phase === 'b') {
          return { title: m.title, text: 'Stay at the bank while the crew works.', x: to.x, z: to.z, progress: state.hold / m.holdTime };
        }
        return { title: m.title, text: `Get the take to the ${PLACES[m.escapeTo].name}.`, x: PLACES[m.escapeTo].x, z: PLACES[m.escapeTo].z };
      default:
        return { title: m.title, text: m.text, x: null, z: null };
    }
  }

  function completeMission(events) {
    const m = currentMission();
    if (!m) return;
    events.push({ type: 'mission-complete', title: m.title, reward: m.reward });
    state.totalEarned += m.reward;
    state.storyIndex += 1;
    state.phase = 'a';
    state.timer = null;
    state.hold = 0;
    state.armed = false;
    if (state.storyIndex >= STORY.length) {
      state.storyDone = true;
      state.cabPhase = 'cooldown';
      state.cabTimer = 2;
      events.push({ type: 'story-done' });
    } else {
      const next = currentMission();
      if (next.kind === 'timed-drive') state.timer = next.time;
      events.push({ type: 'mission-start', title: next.title, text: next.text });
    }
  }

  function failMission(events, why) {
    const m = currentMission();
    if (!m) return;
    events.push({ type: 'mission-fail', title: m.title, why });
    state.phase = 'a';
    state.hold = 0;
    state.timer = m.kind === 'timed-drive' ? m.time : null;
  }

  /** Cross-system signals: 'enteredCar', 'busted', 'wasted'. */
  function notify(signal, events) {
    const m = currentMission();
    if (signal === 'enteredCar' && m && m.kind === 'steal') completeMission(events);
    if (signal === 'busted') {
      if (m && m.kind === 'robbery' && state.phase !== 'a') {
        state.phase = 'a';
        state.hold = 0;
        events.push({ type: 'mission-note', text: 'The take is gone. The bank job resets.' });
      }
      if (state.cabPhase === 'ride') {
        state.cabPhase = 'cooldown';
        state.cabTimer = 4;
        if (passenger) passenger.mesh.visible = false;
      }
    }
  }

  function update(dt, ctx, events) {
    const { playerPos, inCar, carSpeed, stars, time } = ctx;
    const m = currentMission();
    const obj = objective();

    // beacon follows the objective
    if (obj.x !== null && obj.x !== undefined) {
      beacon.visible = true;
      beacon.position.set(obj.x, 0, obj.z);
      beam.material.opacity = 0.24 + Math.sin(time * 3.2) * 0.08;
      ring.scale.setScalar(1 + Math.sin(time * 3.2) * 0.08);
    } else {
      beacon.visible = false;
    }

    // countdowns
    if (state.timer !== null && m) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = null;
        failMission(events, 'Out of time.');
      }
    }

    const near = (x, z, r) => dist2d(playerPos.x, playerPos.z, x, z) < r;

    if (m) {
      if (m.kind === 'pickup-deliver') {
        const from = PLACES[m.from];
        const to = PLACES[m.to];
        if (state.phase === 'a' && near(from.x, from.z, 7)) {
          state.phase = 'b';
          state.timer = m.time;
          events.push({ type: 'mission-note', text: 'Package on board. Move!' });
          if (m.heatOnPickup) events.push({ type: 'draw-heat', stars: m.heatOnPickup });
        } else if (state.phase === 'b' && near(to.x, to.z, 8)) {
          completeMission(events);
        }
      } else if (m.kind === 'loseheat') {
        if (!state.armed && stars >= m.minStars) state.armed = true;
        if (state.armed && stars === 0) completeMission(events);
      } else if (m.kind === 'timed-drive') {
        const to = PLACES[m.to];
        if (state.timer === null) state.timer = m.time;
        if (near(to.x, to.z, 9)) completeMission(events);
      } else if (m.kind === 'robbery') {
        const bank = PLACES[m.at];
        const garage = PLACES[m.escapeTo];
        if (state.phase === 'a' && near(bank.x, bank.z, 11)) {
          state.phase = 'b';
          state.hold = 0;
          events.push({ type: 'mission-note', text: 'The crew is inside. Hold position.' });
        } else if (state.phase === 'b') {
          if (near(bank.x, bank.z, 12)) {
            state.hold += dt;
            if (state.hold >= m.holdTime) {
              state.phase = 'c';
              events.push({ type: 'crime', kind: 'robbery', x: bank.x, z: bank.z });
              events.push({ type: 'mission-note', text: 'Take secured. GO!' });
            }
          } else {
            state.hold = Math.max(0, state.hold - dt * 1.5);
          }
        } else if (state.phase === 'c' && near(garage.x, garage.z, 9)) {
          completeMission(events);
        }
      }
    } else if (state.storyDone) {
      // -- endless cab work ------------------------------------------------------
      if (state.cabPhase === 'cooldown') {
        state.cabTimer -= dt;
        if (state.cabTimer <= 0) {
          placePassenger(playerPos);
          state.cabPhase = 'offer';
        }
      } else if (state.cabPhase === 'offer' && passenger) {
        passenger.mesh.rotation.y += dt * 1.2;
        if (inCar && Math.abs(carSpeed) < 1.5 && near(passenger.x, passenger.z, 5)) {
          passenger.boarded = true;
          passenger.mesh.visible = false;
          const destPlace = rng.pick(Object.values(PLACES));
          passenger.dest = { x: destPlace.x + 10, z: destPlace.z + 10, label: destPlace.name };
          state.fareDist = dist2d(passenger.x, passenger.z, passenger.dest.x, passenger.dest.z);
          state.fareStart = time;
          state.cabPhase = 'ride';
          events.push({ type: 'mission-note', text: `Passenger in. ${destPlace.name}, please.` });
        }
      } else if (state.cabPhase === 'ride' && passenger?.dest) {
        if (inCar && Math.abs(carSpeed) < 1.5 && near(passenger.dest.x, passenger.dest.z, 7)) {
          const rideTime = Math.max(1, time - state.fareStart);
          const par = state.fareDist / 11;
          let fare = Math.round(CAB.minFare + state.fareDist * CAB.perMeter);
          if (rideTime < par * (1 + CAB.tipWindow)) fare = Math.round(fare * 1.3);
          state.totalEarned += fare;
          events.push({ type: 'fare', amount: fare });
          state.cabPhase = 'cooldown';
          state.cabTimer = 5;
          passenger.dest = null;
        }
      }
    }

    // -- pickups ------------------------------------------------------------------
    for (const p of pickups) {
      if (!p.active) continue;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = 0.7 + Math.sin(time * 2.6 + p.spin) * 0.18;
      if (dist2d(playerPos.x, playerPos.z, p.x, p.z) < 2.1) {
        p.active = false;
        p.mesh.visible = false;
        events.push({ type: 'pickup-cash', amount: p.amount });
        window.setTimeout(() => placePickup(p), 9000);
      }
    }
    return obj;
  }

  function startAt(index) {
    state.storyIndex = clamp(index, 0, STORY.length);
    state.storyDone = state.storyIndex >= STORY.length;
    state.phase = 'a';
    state.hold = 0;
    state.armed = false;
    const m = currentMission();
    state.timer = m && m.kind === 'timed-drive' ? m.time : null;
    if (state.storyDone) {
      state.cabPhase = 'cooldown';
      state.cabTimer = 2;
    }
  }

  return { state, objective, update, notify, startAt, currentMission };
}
