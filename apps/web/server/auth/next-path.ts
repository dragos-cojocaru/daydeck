/**
 * Returns `value` if it is a safe path inside this app to go to after connecting, otherwise
 * null. Blocks open redirects such as "//evil.example" or "https://evil.example".
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // Resolve against a dummy origin: anything that escapes it is not a local path.
  try {
    const url = new URL(value, "https://daydeck.invalid");
    if (url.origin !== "https://daydeck.invalid") return null;
    if (url.pathname.startsWith("/api/")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
