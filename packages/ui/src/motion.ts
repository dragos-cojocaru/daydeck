import type { Transition } from "motion/react";

// Shared motion presets. Interface moves take 150 to 300 ms; celebrations stay under
// 600 ms and play once. With prefers-reduced-motion, components swap movement for `fade`.

export const duration = {
  fast: 0.15,
  base: 0.22,
  slow: 0.3,
  celebrate: 0.55,
} as const;

export const spring = {
  /** Buttons, toggles, small layout shifts. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Cards moving between deck, tray and timeline. */
  card: { type: "spring", stiffness: 340, damping: 30, mass: 0.9 },
  /** A board cell igniting once when a post lands. */
  ignite: { type: "spring", stiffness: 260, damping: 18, mass: 0.8 },
} satisfies Record<string, Transition>;

export const fade: Transition = { duration: duration.fast, ease: "easeOut" };
