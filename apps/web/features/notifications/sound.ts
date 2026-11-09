"use client";

import { useSyncExternalStore } from "react";

// The notification sound: a short, soft two-note chime made with the Web Audio API, so there is
// no file to load. The on/off choice is per device, in this browser's storage, like Slack's
// "Mute all sounds". Browsers allow sound only after a click or key press on the page.

const KEY = "daydeck:notification-sound";
const CHANGE = "daydeck:sound-change";
const MIN_GAP_MS = 3_000;

let context: AudioContext | null = null;
let lastPlayed = 0;

function readSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Whether this device plays the sound. The server renders it as on. */
export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, readSetting, () => true);
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
  if (on) {
    unlockSound();
    playChime(true);
  }
}

/** Call from a click or key press: browsers start audio only after one. */
export function unlockSound(): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    // No Web Audio here: the badge and the screen reader message still say what is new.
  }
}

/** Plays the chime, at most once every 3 seconds. `force` skips the setting (the preview). */
export function playChime(force = false): void {
  if (!force && !readSetting()) return;
  if (!context || context.state !== "running") return;
  const now = Date.now();
  if (!force && now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;
  const start = context.currentTime;
  for (const [index, frequency] of [880, 1320].entries()) {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    const at = start + index * 0.09;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.08, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    tone.connect(gain).connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.3);
  }
}
