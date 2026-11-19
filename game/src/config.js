// config.js — every shared constant for SOLARA HEAT: city geometry, tuning
// numbers, place definitions and the story mission script. Other modules read
// from here so the whole game can be rebalanced in one place.

export const CITY = {
  avenues: [-112, -56, 0, 56, 112], // road centre lines on both axes
  roadHalf: 7,                      // half the width of a road
  laneOffset: 3.4,                  // traffic keeps this far from the centre line
  edge: 140,                        // building lots stop here
  beachZ: 150,                      // sand starts at this z
  seaZ: 172,                        // water starts at this z
  blockPad: 3.5,                    // gap between a road edge and the building lots
};

export const PLACES = {
  garage:   { name: 'Solara Auto Garage', short: 'GARAGE',   x: -28,  z: 96,  color: 0xffb340 },
  bank:     { name: 'Solara Trust Bank',  short: 'BANK',     x: 28,   z: -40, color: 0xffe9a8 },
  casino:   { name: 'Coral Crown Casino', short: 'CASINO',   x: 92,   z: 28,  color: 0xff5da2 },
  hospital: { name: 'Solara General',     short: 'HOSPITAL', x: 84,   z: -96, color: 0xffffff },
  precinct: { name: 'SBPD Precinct 9',    short: 'POLICE',   x: -93,  z: -84, color: 0x6fb7ff },
  airport:  { name: 'Solara Airfield',    short: 'AIRPORT',  x: -92,  z: 84,  color: 0xc9d6ff },
  marina:   { name: 'Solara Marina',      short: 'MARINA',   x: 84,   z: 196, color: 0x53e0c8 },
  beach:    { name: 'Solara Beach',       short: 'BEACH',    x: 0,    z: 158, color: 0xffe6a3 },
};

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.0,
  radius: 0.55,
  health: 100,
  punchRange: 1.9,
  enterRange: 3.4,
};

export const CAR_TUNING = {
  accel: 15,
  brake: 28,
  reverseMax: 9,
  drag: 0.6,
  steerMax: 0.6,
  radius: 1.55,
};

export const HEAT = {
  // points needed to hold each star level (index = stars)
  thresholds: [0, 12, 30, 55, 85, 120],
  decayPerSecond: 2.8,
  unseenGrace: 3.0,   // seconds out of sight before decay starts
  witnessRadius: 26,
  arrestFillTime: 2.4,
  arrestRadius: 8,
};

export const CRIME = {
  carjack: 16,
  stealWitnessed: 6,
  punch: 10,
  runOver: 26,
  hitCar: 5,
  hitProp: 3,
  robbery: 70,
};

export const COPS = {
  maxByStars: [0, 2, 3, 4, 6, 8],
  speedByStars: [0, 22, 24, 26, 28, 31],
  spawnDistance: 85,
  despawnDistance: 160,
};

export const ECONOMY = {
  startMoney: 60,
  bustedFineBase: 80,
  bustedFinePerStar: 45,
  wastedFine: 120,
  pickupMin: 10,
  pickupMax: 45,
};

// The story chain. missions.js resolves each step: `kind` names the objective
// type, `from`/`to`/`at` name PLACES keys, `time` is a countdown in seconds.
export const STORY = [
  {
    id: 'wheels', title: 'Wheels Up', kind: 'steal',
    text: 'Steal a car. Any car. Make it yours.',
    reward: 150,
  },
  {
    id: 'package', title: 'Hot Package', kind: 'pickup-deliver',
    from: 'garage', to: 'marina', time: 80,
    text: 'Pick up the package at the garage, drop it at the marina. Clock is ticking.',
    reward: 300, heatOnPickup: 2,
  },
  {
    id: 'cooldown', title: 'Cool Down', kind: 'loseheat', minStars: 2,
    text: 'Too hot. Lay low until the police give up.',
    reward: 200,
  },
  {
    id: 'downtown', title: 'Downtown Run', kind: 'timed-drive',
    to: 'airport', time: 75,
    text: 'A courier pouch has to reach Solara Airfield. Fast.',
    reward: 400,
  },
  {
    id: 'trustjob', title: 'The Solara Trust Job', kind: 'robbery',
    at: 'bank', escapeTo: 'garage', holdTime: 5,
    text: 'Hit the Solara Trust Bank, then get the take back to the garage.',
    reward: 800,
  },
];

export const CAB = {
  minFare: 25,
  perMeter: 0.55,
  tipWindow: 0.5, // arrive within this share of par time to earn a tip
};

export const SAVE_KEY = 'solara-heat-save-v1';

export const SKY = {
  background: 0x9fd7ef,
  fog: 0xbfe3ef,
  sun: 0xfff2cf,
  ground: 0x8f9a94,
};
