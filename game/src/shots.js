// shots.js — the staged scenes behind ?shot=<name>&seed=N, used to take the
// entry's screenshots from the running game. Each scene is set up through
// the game's own systems (real cars, real police, real mission state), then
// the normal loop plays it: what the camera sees is gameplay, not a diorama.
import { PLACES } from './config.js';

function putPlayerInCar(G, car) {
  G.playerCar = car;
  car.role = 'player';
  car.occupied = true;
  G.people.player.inCar = car;
  G.people.player.mesh.visible = false;
}

function addCop(G, x, z, heading) {
  const cop = G.cars.makeCop(x, z);
  cop.heading = heading;
  cop.reverseT = 0;
  cop.stuckT = 0;
  G.police.cops.push(cop);
  return cop;
}

function findCar(G, style) {
  return G.cars.cars.find((c) => c.style === style && c.role !== 'cop')
    || G.cars.cars.find((c) => c.role === 'parked');
}

const SCENES = {
  // The cover: a three-star escape run down the central avenue, package
  // delivered, sirens behind, the whole HUD alive.
  cover(G) {
    const car = findCar(G, 'sport') || findCar(G);
    car.x = 4;
    car.z = 3.4;
    car.heading = Math.PI / 2;
    car.speed = 17;
    putPlayerInCar(G, car);
    addCop(G, -16, 3.4, Math.PI / 2).speed = 16;
    addCop(G, -25, -3.4, Math.PI / 2).speed = 15;
    G.police.setStarsAtLeast(3);
    G.missions.startAt(1);
    G.missions.state.phase = 'b';
    G.missions.state.timer = 52;
    G.money = 430;
    G.cameraYaw = Math.PI / 2;
    G.shotCruise = true;
  },
  // On foot downtown: crowds, traffic, the first job waiting.
  foot(G) {
    G.people.setPlayerPos(24, -6, -Math.PI / 2);
    G.missions.startAt(0);
    G.money = 60;
    G.cameraYaw = -Math.PI / 2 + 0.4;
    // a couple of pedestrians close by for life
    const peds = G.people.peds;
    if (peds[0]) { peds[0].x = 27; peds[0].z = -2; }
    if (peds[1]) { peds[1].x = 21; peds[1].z = -11; }
  },
  // The bank job, mid-hold: the player waits at the bank's front doors, the
  // beacon is up, and the first SBPD car is already rolling in.
  mission(G) {
    const bank = PLACES.bank;
    G.people.setPlayerPos(bank.x, bank.z + 11, Math.PI);
    G.missions.startAt(4);
    G.missions.state.phase = 'b';
    G.missions.state.hold = 0.8;
    G.police.setStarsAtLeast(2);
    addCop(G, -3.4, -64, 0).speed = 9;
    G.money = 1240;
    G.cameraYaw = Math.PI;
  },
  // On the pier, facing the open sea: boats bobbing, the bay ahead.
  marina(G) {
    G.people.setPlayerPos(PLACES.marina.x - 2, 190, 0);
    G.missions.startAt(5);
    G.money = 2130;
    G.cameraYaw = 0;
  },
};

export function applyShot(G, name) {
  const scene = SCENES[name] || SCENES.cover;
  scene(G);
}
