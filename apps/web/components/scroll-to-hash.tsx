"use client";

import { useEffect } from "react";

/**
 * Scrolls to its section when the address ends in "#id". Browsers do this only for parts that
 * exist when the page loads; a part that streams in later needs this.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
  }, [id]);
  return null;
}
