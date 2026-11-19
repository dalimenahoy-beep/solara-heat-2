// save.js — the localStorage save: money, story progress and lifetime
// earnings, written whenever something is earned and read back by the title
// screen's Continue button. Storage failures (private windows, quotas) are
// swallowed: the game then simply lasts for the visit.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: Number.isFinite(data.money) ? data.money : 0,
      storyIndex: Number.isFinite(data.storyIndex) ? data.storyIndex : 0,
      totalEarned: Number.isFinite(data.totalEarned) ? data.totalEarned : 0,
    };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // no storage available: play on without it
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear
  }
}
