import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

// Placeholder pairing: a characterful display face for headings, a plain face for text.
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
});

export const textFont = Geist({
  subsets: ["latin"],
  variable: "--font-text",
});

// Only used for invite links; not preloaded, so it never competes with the page's main content.
export const codeFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  preload: false,
});
