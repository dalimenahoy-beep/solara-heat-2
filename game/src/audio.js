// audio.js — every sound in SOLARA HEAT is synthesized with WebAudio: a
// two-oscillator engine voice, a two-tone police siren, one-shot effects and
// a small step-sequenced radio loop for car rides. No audio files exist.
// The context is created lazily on the first user gesture, as browsers ask.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let radioTimer = null;
  let radioStep = 0;
  let muted = false;
  let radioOn = true;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, when = 0, low = 400, high = 2400) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (low + high) / 2;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  // -- continuous voices ----------------------------------------------------

  function engine(on, rpm) {
    if (!ensure()) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 40;
      engineGain.gain.value = 0.05;
      engineOsc.connect(engineGain);
      sub.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sub.start();
      engineOsc._sub = sub;
    }
    if (engineOsc) {
      const f = 55 + rpm * 130;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      if (engineOsc._sub) engineOsc._sub.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(on ? 0.045 + rpm * 0.05 : 0, ctx.currentTime, 0.08);
    }
  }

  function siren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenLfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 800;
      sirenLfo.frequency.value = 0.9;
      lfoGain.gain.value = 160;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    if (sirenGain) sirenGain.gain.setTargetAtTime(on ? 0.028 : 0, ctx.currentTime, 0.15);
  }

  // -- radio: a laid-back bass + hat loop, sequenced on a timer --------------

  const BASSLINE = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 73.4, 0, 61.7, 0];

  function radioTick() {
    if (!radioOn || muted) return;
    const step = radioStep % BASSLINE.length;
    const note = BASSLINE[step];
    if (note) tone(note, 0.16, 'triangle', 0.11);
    if (step % 2 === 0) noise(0.03, 0.015, 0, 6000, 9000);
    if (step % 8 === 4) tone(220, 0.1, 'sine', 0.05);
    radioStep += 1;
  }

  function radio(on) {
    if (on && !radioTimer && ensure()) {
      radioTimer = window.setInterval(radioTick, 150);
    } else if (!on && radioTimer) {
      window.clearInterval(radioTimer);
      radioTimer = null;
    }
  }

  // -- one-shot effects -------------------------------------------------------

  return {
    unlock: ensure,
    engine,
    siren,
    radio,
    radioEnabled: () => radioOn,
    toggleRadio() {
      radioOn = !radioOn;
      if (!radioOn) radio(false);
      return radioOn;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted: () => muted,
    door: () => { tone(180, 0.07, 'square', 0.08); tone(120, 0.09, 'square', 0.07, 0.07); },
    punch: () => noise(0.09, 0.16, 0, 200, 900),
    cash: () => { tone(880, 0.07, 'sine', 0.1); tone(1318, 0.1, 'sine', 0.1, 0.06); },
    crash: (hard) => noise(hard ? 0.3 : 0.16, hard ? 0.3 : 0.18, 0, 150, 1600),
    pickup: () => { tone(523, 0.08, 'triangle', 0.12); tone(784, 0.12, 'triangle', 0.12, 0.07); },
    sting: () => { tone(392, 0.12, 'triangle', 0.12); tone(523, 0.12, 'triangle', 0.12, 0.1); tone(659, 0.2, 'triangle', 0.13, 0.2); },
    fail: () => { tone(220, 0.18, 'sawtooth', 0.08); tone(155, 0.3, 'sawtooth', 0.08, 0.14); },
    busted: () => { tone(660, 0.12, 'square', 0.09); tone(660, 0.12, 'square', 0.09, 0.2); tone(440, 0.3, 'square', 0.09, 0.4); },
    sirenBlip: () => tone(950, 0.09, 'triangle', 0.07, 0, 620),
  };
}
