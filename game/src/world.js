// world.js — builds Solara Bay as three.js geometry: the avenue grid with
// marked lanes and crosswalks, pastel tower blocks, the named places (bank,
// casino, hospital, precinct, airfield, garage, marina), palms, streetlights,
// beach and animated sea. It also owns the collision data every mover uses:
// building AABBs and knock-over street props.
import * as THREE from 'three';
import { CITY, PLACES, SKY } from './config.js';
import { clamp } from './random.js';

const PASTELS = [0xf7ead9, 0xf3d9c8, 0xd9e8f3, 0xd3efe2, 0xf9e2e4, 0xfff6c9, 0xe6ddf5, 0xfce8d5];
const ROOFS = [0xb08968, 0x9c6644, 0x7f8c8d, 0xa26769, 0x5d6d7e];

function makeWindowTexture(rng, lit) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2c3e50';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const on = rng.chance(lit);
      g.fillStyle = on ? '#ffd97a' : '#46617a';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeLabelSprite(text, colorHex) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10, 20, 30, 0.72)';
  g.beginPath();
  g.roundRect(6, 10, 500, 76, 18);
  g.fill();
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(13.5, 2.55, 1);
  sprite.material.color.setHex(colorHex === 0xffffff ? 0xffffff : 0xffffff);
  return sprite;
}

function makePalmTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#2e8b57';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64, 70);
    g.quadraticCurveTo(64 + Math.cos(a) * 34, 70 + Math.sin(a) * 20 - 16, 64 + Math.cos(a) * 58, 70 + Math.sin(a) * 34 + 14);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createWorld(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const props = [];
  const animated = [];

  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.fog, 120, 420);

  const hemi = new THREE.HemisphereLight(0xcfeeff, 0x8a7f5c, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.sun, 1.9);
  sun.position.set(60, 110, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // -- ground base -----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x77a06b }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // -- roads -----------------------------------------------------------------
  const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5eeda });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xd8dde2 });
  const roadGroup = new THREE.Group();
  group.add(roadGroup);

  function addRoadStrip(horizontal, at) {
    const len = CITY.edge * 2 + 30;
    const geo = new THREE.PlaneGeometry(horizontal ? len : CITY.roadHalf * 2, horizontal ? CITY.roadHalf * 2 : len);
    const mesh = new THREE.Mesh(geo, asphaltMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(horizontal ? 0 : at, 0.01, horizontal ? at : 0);
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
    // dashed centre line
    for (let d = -len / 2 + 4; d < len / 2 - 4; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? 3.6 : 0.35, horizontal ? 0.35 : 3.6), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(horizontal ? d : at, 0.03, horizontal ? at : d);
      roadGroup.add(dash);
    }
    // crosswalks where this road meets every crossing avenue
    for (const cross of CITY.avenues) {
      for (let s = -5; s <= 5; s += 2.2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? 0.9 : 1.7, horizontal ? 1.7 : 0.9), crossMat);
        stripe.rotation.x = -Math.PI / 2;
        const along = cross + (horizontal ? 0 : 0);
        stripe.position.set(horizontal ? along + 0 : at + s * 0.9, 0.025, horizontal ? at + s * 0.9 : along);
        if (horizontal) stripe.position.x = cross;
        else stripe.position.z = cross;
        roadGroup.add(stripe);
      }
    }
  }
  for (const a of CITY.avenues) {
    addRoadStrip(false, a);
    addRoadStrip(true, a);
  }
  // shore road down to the marina
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), asphaltMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(PLACES.marina.x, 0.01, 168);
  shore.receiveShadow = true;
  roadGroup.add(shore);

  // sidewalks: pale slabs ringing every block
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfd4d1 });
  for (let i = 0; i < CITY.avenues.length - 1; i += 1) {
    for (let j = 0; j < CITY.avenues.length - 1; j += 1) {
      const x0 = CITY.avenues[i] + CITY.roadHalf;
      const x1 = CITY.avenues[i + 1] - CITY.roadHalf;
      const z0 = CITY.avenues[j] + CITY.roadHalf;
      const z1 = CITY.avenues[j + 1] - CITY.roadHalf;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.18, z1 - z0), walkMat);
      slab.position.set((x0 + x1) / 2, 0.09, (z0 + z1) / 2);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // -- buildings ---------------------------------------------------------------
  const windowTexA = makeWindowTexture(rng, 0.25);
  const windowTexB = makeWindowTexture(rng, 0.45);
  windowTexA.repeat.set(2, 3);
  windowTexB.repeat.set(2, 2);
  const buildingMats = PASTELS.map((color, i) => new THREE.MeshLambertMaterial({
    color,
    map: i % 2 ? windowTexA : windowTexB,
  }));
  const roofMats = ROOFS.map((color) => new THREE.MeshLambertMaterial({ color }));

  function addBuilding(cx, cz, w, d, h, matIndex) {
    const mat = buildingMats[matIndex % buildingMats.length];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, h / 2 + 0.18, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 0.7, d * 0.92),
      roofMats[matIndex % roofMats.length],
    );
    roof.position.set(cx, h + 0.5, cz);
    roof.castShadow = true;
    group.add(roof);
    if (rng.chance(0.4)) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 1.4, d * 0.3), roofMats[(matIndex + 2) % roofMats.length]);
      box.position.set(cx + rng.range(-w / 5, w / 5), h + 1.4, cz + rng.range(-d / 5, d / 5));
      box.castShadow = true;
      group.add(box);
    }
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  }

  const placePoints = Object.values(PLACES);
  const nearPlace = (x, z) => placePoints.some((p) => Math.abs(p.x - x) < 17 && Math.abs(p.z - z) < 17 && p.z < CITY.beachZ);

  // Fill each block with a 2x2 of lots; downtown blocks grow taller.
  for (let i = 0; i < CITY.avenues.length - 1; i += 1) {
    for (let j = 0; j < CITY.avenues.length - 1; j += 1) {
      const x0 = CITY.avenues[i] + CITY.roadHalf + CITY.blockPad;
      const x1 = CITY.avenues[i + 1] - CITY.roadHalf - CITY.blockPad;
      const z0 = CITY.avenues[j] + CITY.roadHalf + CITY.blockPad;
      const z1 = CITY.avenues[j + 1] - CITY.roadHalf - CITY.blockPad;
      const downtown = Math.abs((x0 + x1) / 2) < 60 && Math.abs((z0 + z1) / 2) < 60;
      for (let a = 0; a < 2; a += 1) {
        for (let b = 0; b < 2; b += 1) {
          const cx = x0 + ((x1 - x0) * (a + 0.5)) / 2;
          const cz = z0 + ((z1 - z0) * (b + 0.5)) / 2;
          if (nearPlace(cx, cz)) continue;
          if (rng.chance(0.12)) continue; // a few empty lots / car parks
          const w = rng.range(11, 15.5);
          const d = rng.range(11, 15.5);
          const h = downtown ? rng.range(16, 42) : rng.range(7, 20);
          addBuilding(cx, cz, w, d, h, rng.int(0, PASTELS.length - 1));
        }
      }
    }
  }

  // -- the named places ----------------------------------------------------------
  function addPlaceBuilding(key, w, d, h, color) {
    const p = PLACES[key];
    const mat = new THREE.MeshLambertMaterial({ color, map: windowTexB });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(p.x, h / 2 + 0.18, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const sign = makeLabelSprite(p.short, p.color);
    sign.position.set(p.x, h + 4.5, p.z);
    group.add(sign);
    colliders.push({ minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 });
    return mesh;
  }
  addPlaceBuilding('bank', 20, 14, 13, 0xe8dcc0);
  addPlaceBuilding('casino', 18, 16, 11, 0x8e44ad);
  addPlaceBuilding('hospital', 22, 14, 15, 0xf4f6f6);
  addPlaceBuilding('precinct', 18, 14, 10, 0x5d6d7e);
  addPlaceBuilding('garage', 18, 12, 7, 0xe08a4e);
  addPlaceBuilding('airport', 18, 12, 8, 0xaeb6bf);

  // airfield apron + a parked plane west of the terminal
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(PLACES.airport.x - 4, 0.04, PLACES.airport.z + 2);
  apron.receiveShadow = true;
  group.add(apron);
  {
    const plane = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f3f4 });
    const accent = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 13, 12), white);
    body.rotation.z = Math.PI / 2;
    body.position.y = 2.4;
    plane.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 13), accent);
    wing.position.y = 2.2;
    plane.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 2.6), accent);
    tail.position.set(-6.2, 4.2, 0);
    plane.add(tail);
    plane.position.set(PLACES.airport.x - 6, 0.2, PLACES.airport.z + 4);
    plane.rotation.y = 0.5;
    plane.traverse((o) => { o.castShadow = true; });
    group.add(plane);
    colliders.push({ minX: PLACES.airport.x - 11, maxX: PLACES.airport.x + 2, minZ: PLACES.airport.z - 3, maxZ: PLACES.airport.z + 11 });
  }

  // -- beach, sea and marina ------------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(700, CITY.seaZ - CITY.beachZ + 26),
    new THREE.MeshLambertMaterial({ color: 0xeed9a4 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (CITY.beachZ + CITY.seaZ) / 2 + 4);
  sand.receiveShadow = true;
  group.add(sand);

  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 128;
  seaCanvas.height = 128;
  {
    const g = seaCanvas.getContext('2d');
    g.fillStyle = '#1d7fa8';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i += 1) {
      const y = rng.range(0, 128);
      g.beginPath();
      g.moveTo(rng.range(0, 60), y);
      g.lineTo(rng.range(70, 128), y + rng.range(-3, 3));
      g.stroke();
    }
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(24, 8);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 190),
    new THREE.MeshPhongMaterial({ color: 0x2e9bc4, map: seaTex, shininess: 90 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.12, CITY.seaZ + 92);
  group.add(sea);

  // pier planks, posts and bobbing boats at the marina
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9c7248 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 52), woodMat);
  pier.position.set(PLACES.marina.x, 0.55, CITY.seaZ + 24);
  pier.castShadow = true;
  group.add(pier);
  const marinaSign = makeLabelSprite(PLACES.marina.short, PLACES.marina.color);
  marinaSign.position.set(PLACES.marina.x, 7, CITY.seaZ + 2);
  group.add(marinaSign);
  const boatColors = [0xecf0f1, 0xe74c3c, 0xf1c40f];
  for (let i = 0; i < 3; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 7), new THREE.MeshLambertMaterial({ color: boatColors[i] }));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 2.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    cabin.position.set(0, 1.4, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6), woodMat);
    mast.position.set(0, 3.4, 1.2);
    boat.add(mast);
    boat.position.set(PLACES.marina.x + (i - 1) * 9, 0.25, CITY.seaZ + 26 + (i % 2) * 9);
    boat.rotation.y = rng.range(-0.3, 0.3);
    group.add(boat);
    animated.push((t) => {
      boat.position.y = 0.25 + Math.sin(t * 1.3 + i * 2.1) * 0.16;
      boat.rotation.z = Math.sin(t * 0.9 + i) * 0.03;
    });
  }

  // -- palms and streetlights ------------------------------------------------------
  const palmTex = makePalmTexture();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const frondMat = new THREE.MeshLambertMaterial({ map: palmTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.6, 6);
  const frondGeo = new THREE.PlaneGeometry(6.4, 6.4);

  function addPalm(x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.8;
    trunk.rotation.z = rng.range(-0.07, 0.07);
    trunk.castShadow = true;
    palm.add(trunk);
    for (let i = 0; i < 2; i += 1) {
      const fronds = new THREE.Mesh(frondGeo, frondMat);
      fronds.rotation.x = -Math.PI / 2 + rng.range(-0.25, 0.25);
      fronds.rotation.z = i * Math.PI / 2 + rng.range(0, 1);
      fronds.position.y = 5.7;
      palm.add(fronds);
    }
    palm.position.set(x, 0, z);
    group.add(palm);
    props.push({ x, z, r: 0.5, mesh: palm, down: false, kind: 'palm' });
    return palm;
  }
  // beach rows
  for (let x = -150; x <= 150; x += 15) {
    if (Math.abs(x - PLACES.marina.x) < 10) continue;
    if (rng.chance(0.8)) addPalm(x + rng.range(-3, 3), CITY.beachZ + rng.range(2, 9));
  }
  // sidewalk palms scattered through town
  for (let i = 0; i < 26; i += 1) {
    const a = rng.pick(CITY.avenues) + rng.sign() * (CITY.roadHalf + 1.6);
    const b = rng.range(-CITY.edge, CITY.edge);
    if (nearPlace(a, b)) continue;
    addPalm(rng.chance(0.5) ? a : b, rng.chance(0.5) ? b : a);
  }

  const poleMat = new THREE.MeshLambertMaterial({ color: 0x424949 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5);
  const lampGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  for (const ax of CITY.avenues) {
    for (const az of CITY.avenues) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.y = 2.7;
          lamp.add(pole);
          const head = new THREE.Mesh(lampGeo, lampMat);
          head.position.set(-sx * 0.7, 5.4, -sz * 0.7);
          lamp.add(head);
          lamp.position.set(ax + sx * (CITY.roadHalf + 0.7), 0, az + sz * (CITY.roadHalf + 0.7));
          group.add(lamp);
        }
      }
    }
  }

  // knock-over props: hydrants and news boxes on the sidewalks
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd23c2a });
  const boxMat = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  for (let i = 0; i < 22; i += 1) {
    const x = rng.pick(CITY.avenues) + rng.sign() * (CITY.roadHalf + 1.1);
    const z = rng.range(-CITY.edge, CITY.edge);
    const isHydrant = rng.chance(0.5);
    const mesh = new THREE.Mesh(
      isHydrant ? new THREE.CylinderGeometry(0.26, 0.3, 0.8, 8) : new THREE.BoxGeometry(0.7, 1.0, 0.5),
      isHydrant ? hydrantMat : boxMat,
    );
    mesh.position.set(x, 0.45, z);
    mesh.castShadow = true;
    group.add(mesh);
    props.push({ x, z, r: 0.45, mesh, down: false, kind: isHydrant ? 'hydrant' : 'newsbox' });
  }

  // -- queries the movers use -------------------------------------------------------

  /** Push a circle at (pos.x, pos.z) out of every building AABB; true if it hit. */
  function resolveCollisions(pos, radius) {
    let hit = false;
    for (const b of colliders) {
      const nx = clamp(pos.x, b.minX, b.maxX);
      const nz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: leave by the shallowest side
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const top = pos.z - b.minZ;
        const bottom = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
    return hit;
  }

  function surfaceAt(x, z) {
    if (z > CITY.seaZ) return 'water';
    if (z > CITY.beachZ) return 'sand';
    for (const a of CITY.avenues) {
      if (Math.abs(x - a) < CITY.roadHalf || Math.abs(z - a) < CITY.roadHalf) return 'road';
    }
    if (Math.abs(x - PLACES.marina.x) < 5 && z > CITY.edge) return 'road';
    return 'ground';
  }

  function update(dt, t) {
    seaTex.offset.x = t * 0.008;
    seaTex.offset.y = Math.sin(t * 0.22) * 0.01;
    for (const fn of animated) fn(t);
  }

  return {
    group,
    sun,
    colliders,
    props,
    resolveCollisions,
    surfaceAt,
    update,
    // spawn point: on the sidewalk east of the garage, facing up the street
    spawn: { x: PLACES.garage.x + 15, z: PLACES.garage.z + 12, heading: Math.PI },
  };
}
