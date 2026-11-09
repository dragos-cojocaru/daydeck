// Link previews for chat messages. This module finds the first link in a message, names the
// social network it belongs to, and reads the page's Open Graph tags (title, text, image) for a
// preview card. Pages are fetched on the server, so every request is checked first and private or
// internal addresses are refused. This protects against SSRF (server-side request forgery).
import { lookup as dnsLookup } from "node:dns/promises";

export interface LinkPreview {
  /** The URL asked for. */
  url: string;
  /** The URL after redirects. */
  finalUrl: string;
  title: string | null;
  /** Trimmed, with whitespace collapsed, at most 300 characters (ends with "…" when cut). */
  description: string | null;
  /** An absolute https URL, or null. */
  imageUrl: string | null;
  siteName: string | null;
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  /** Resolves a hostname to its addresses; default uses node:dns/promises lookup with { all: true }. */
  lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  /** Time limit for the whole operation, in milliseconds. Default 5000. */
  timeoutMs?: number;
}

const MAX_URL_LENGTH = 2000;
const MAX_TEXT_LENGTH = 300;
const MAX_REDIRECTS = 4;
const MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT = "Mozilla/5.0 (compatible; DaydeckBot/1.0; +https://daydeck.app)";
const ACCEPT = "text/html,application/xhtml+xml";
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TIMEOUT_MESSAGE = "The page took too long to answer.";

// A link starts with http:// or https:// and runs until a space, a quote or an angle bracket.
const LINK_PATTERN = /\bhttps?:\/\/[^\s<>"`]+/gi;
const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "'", "…"]);
const BRACKET_PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** First http(s) link in a chat message, or null. Trailing punctuation like ).,!? is not part of the link. Max URL length 2000. */
export function firstLink(text: string): string | null {
  for (const match of text.matchAll(LINK_PATTERN)) {
    const link = trimTrailing(match[0]);
    if (link.length > MAX_URL_LENGTH) continue;
    if (URL.parse(link)?.hostname) return link;
  }
  return null;
}

/** Removes punctuation at the end of a link, and closing brackets without an opening partner. */
function trimTrailing(link: string): string {
  const counts: Record<string, number> = {};
  for (const char of link) {
    if ("()[]{}".includes(char)) counts[char] = (counts[char] ?? 0) + 1;
  }
  let end = link.length;
  while (end > 0) {
    const char = link.charAt(end - 1);
    const partner = BRACKET_PAIRS[char];
    if (TRAILING_PUNCTUATION.has(char)) {
      end--;
    } else if (partner !== undefined && (counts[char] ?? 0) > (counts[partner] ?? 0)) {
      counts[char] = (counts[char] ?? 0) - 1;
      end--;
    } else {
      break;
    }
  }
  return link.slice(0, end);
}

// The keys match the Buffer service names, so the UI can show the right logo.
const SERVICE_DOMAINS: [service: string, domains: string[]][] = [
  ["linkedin", ["linkedin.com", "lnkd.in"]],
  ["twitter", ["x.com", "twitter.com", "t.co"]],
  ["instagram", ["instagram.com", "instagr.am"]],
  ["bluesky", ["bsky.app"]],
  ["threads", ["threads.net", "threads.com"]],
  ["tiktok", ["tiktok.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["facebook", ["facebook.com", "fb.com", "fb.watch"]],
  ["pinterest", ["pinterest.com", "pin.it"]],
  ["substack", ["substack.com"]],
  ["mastodon", ["mastodon.social", "mstdn.social"]],
];

// Mastodon runs on many servers, so a post path like /@name/123456 also counts.
const MASTODON_POST_PATH = /^\/@[^/]+\/\d+/;

/** Buffer service key for a URL's network, or null when the URL is not a known social network. */
export function serviceForUrl(url: string): string | null {
  const parsed = URL.parse(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  for (const [service, domains] of SERVICE_DOMAINS) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return service;
  }
  return MASTODON_POST_PATH.test(parsed.pathname) ? "mastodon" : null;
}

/** Reads the preview fields from a page's <head>. Pure function, no network. */
export function parsePreviewHtml(
  html: string,
  baseUrl: string,
): Omit<LinkPreview, "url" | "finalUrl"> {
  const { meta, title } = scanHead(html);
  return {
    title: firstText([meta.get("og:title"), meta.get("twitter:title"), title]),
    description: firstText([
      meta.get("og:description"),
      meta.get("twitter:description"),
      meta.get("description"),
    ]),
    imageUrl: firstImage(
      [
        meta.get("og:image"),
        meta.get("og:image:url"),
        meta.get("og:image:secure_url"),
        meta.get("twitter:image"),
        meta.get("twitter:image:src"),
      ],
      baseUrl,
    ),
    siteName: firstText([meta.get("og:site_name")]),
  };
}

// The text inside these tags is not HTML, so tags that appear inside them are skipped.
const RAW_TEXT_TAGS = new Set(["script", "style", "template", "textarea", "title"]);

/**
 * Walks the tags of the <head> once, from start to end, and collects <meta> values by their
 * property or name (in lower case), plus the first <title>. It stops at </head> or <body>.
 */
function scanHead(html: string): { meta: Map<string, string>; title: string | null } {
  const meta = new Map<string, string>();
  let title: string | null = null;
  const tagName = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/y;
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start === -1) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end === -1) break;
      index = end + 3;
      continue;
    }
    tagName.lastIndex = start;
    const match = tagName.exec(html);
    if (!match) {
      index = start + 1;
      continue;
    }
    const closing = match[1] === "/";
    const name = (match[2] ?? "").toLowerCase();
    const attributesStart = start + match[0].length;
    const end = findTagEnd(html, attributesStart);
    if (end === -1) break;
    if (name === "body" || (closing && name === "head")) break;
    index = end + 1;
    if (closing) continue;
    if (name === "meta") {
      readMeta(html.slice(attributesStart, end), meta);
    } else if (RAW_TEXT_TAGS.has(name)) {
      const close = findClosingTag(html, name, index);
      if (name === "title" && title === null) title = html.slice(index, close);
      index = close;
    }
  }
  return { meta, title };
}

/** Index of the ">" that ends a tag, skipping any ">" inside quoted attribute values. */
function findTagEnd(html: string, from: number): number {
  let quote = "";
  let afterEquals = false;
  for (let i = from; i < html.length; i++) {
    const char = html.charAt(i);
    if (quote) {
      if (char === quote) quote = "";
    } else if ((char === '"' || char === "'") && afterEquals) {
      quote = char;
      afterEquals = false;
    } else if (char === ">") {
      return i;
    } else if (char === "=") {
      afterEquals = true;
    } else if (char.trim() !== "") {
      afterEquals = false;
    }
  }
  return -1;
}

/** Index of the closing tag for a raw text tag like <script>, or the end of the HTML. */
function findClosingTag(html: string, name: string, from: number): number {
  const pattern = new RegExp(`</${name}\\b`, "gi");
  pattern.lastIndex = from;
  return pattern.exec(html)?.index ?? html.length;
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

/** Reads one <meta> tag. The first value for each key wins, as it is the main one. */
function readMeta(source: string, meta: Map<string, string>): void {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? "").toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  const content = attributes.get("content");
  if (content === undefined) return;
  for (const keyAttribute of ["property", "name"]) {
    const key = attributes.get(keyAttribute)?.trim().toLowerCase();
    if (key && !meta.has(key)) meta.set(key, content);
  }
}

/** The first value that still has text after cleaning, or null. */
function firstText(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = decodeEntities(value).replace(/\s+/g, " ").trim();
    if (text) return truncate(text, MAX_TEXT_LENGTH);
  }
  return null;
}

/** The first image that resolves to an absolute https URL, or null. */
function firstImage(values: (string | undefined)[], baseUrl: string): string | null {
  for (const value of values) {
    if (value === undefined) continue;
    const raw = decodeEntities(value).trim();
    if (!raw) continue;
    const image = URL.parse(raw, baseUrl) ?? URL.parse(raw);
    if (image?.protocol === "https:" && image.href.length <= MAX_URL_LENGTH) return image.href;
  }
  return null;
}

/** Cuts text to at most `max` characters, ending with "…" when it is cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const cut = chars
    .slice(0, max - 1)
    .join("")
    .trimEnd();
  return `${cut}…`;
}

// Named entities as code points, so that invisible characters like the no-break space stay
// readable in this file.
const NAMED_ENTITIES: Record<string, number> = {
  amp: 0x26,
  lt: 0x3c,
  gt: 0x3e,
  quot: 0x22,
  apos: 0x27,
  nbsp: 0xa0,
  hellip: 0x2026,
  ndash: 0x2013,
  mdash: 0x2014,
  lsquo: 0x2018,
  rsquo: 0x2019,
  ldquo: 0x201c,
  rdquo: 0x201d,
  middot: 0xb7,
  bull: 0x2022,
  copy: 0xa9,
  reg: 0xae,
  trade: 0x2122,
};

const REPLACEMENT_CHARACTER = 0xfffd;
const ENTITY = /&(?:#(\d{1,7});?|#[xX]([0-9a-fA-F]{1,6});?|([a-zA-Z][a-zA-Z0-9]{1,31});)/g;

/** Decodes HTML entities like &amp; &quot; &#39; and &#x27;. Unknown names stay as they are. */
function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (whole, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) {
      const named = NAMED_ENTITIES[name];
      return named === undefined ? whole : String.fromCodePoint(named);
    }
    const code =
      decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? "", 16);
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return String.fromCodePoint(valid ? code : REPLACEMENT_CHARACTER);
  });
}

function ipv4(a: number, b: number, c: number, d: number): number {
  return a * 2 ** 24 + b * 2 ** 16 + c * 2 ** 8 + d;
}

// IPv4 ranges a server must never fetch, as [first address, prefix length].
const PRIVATE_V4: [base: number, prefix: number][] = [
  [ipv4(0, 0, 0, 0), 8], // "this network"
  [ipv4(10, 0, 0, 0), 8], // private
  [ipv4(100, 64, 0, 0), 10], // carrier-grade NAT
  [ipv4(127, 0, 0, 0), 8], // loopback
  [ipv4(169, 254, 0, 0), 16], // link-local, includes cloud metadata at 169.254.169.254
  [ipv4(172, 16, 0, 0), 12], // private
  [ipv4(192, 0, 0, 0), 24], // IETF protocol assignments
  [ipv4(192, 0, 2, 0), 24], // documentation
  [ipv4(192, 168, 0, 0), 16], // private
  [ipv4(198, 18, 0, 0), 15], // benchmark testing
  [ipv4(198, 51, 100, 0), 24], // documentation
  [ipv4(203, 0, 113, 0), 24], // documentation
  [ipv4(224, 0, 0, 0), 4], // multicast
  [ipv4(240, 0, 0, 0), 4], // reserved, includes 255.255.255.255
];

/** True for addresses a server must never fetch. Text that is not an IP address also counts. */
export function isPrivateAddress(ip: string): boolean {
  let value = ip.trim();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  const v4 = parseIPv4(value);
  if (v4 !== null) return isPrivateV4(v4);
  const v6 = parseIPv6(value);
  if (v6 !== null) return isPrivateV6(v6);
  // Anything that is not a clear IP address is treated as unsafe.
  return true;
}

function isPrivateV4(address: number): boolean {
  return PRIVATE_V4.some(([base, prefix]) => {
    const size = 2 ** (32 - prefix);
    return Math.floor(address / size) === Math.floor(base / size);
  });
}

function isPrivateV6(groups: number[]): boolean {
  const at = (index: number) => groups[index] ?? 0;
  const embedded = at(6) * 2 ** 16 + at(7);
  const zerosBefore = (count: number) => groups.slice(0, count).every((group) => group === 0);
  // ::ffff:a.b.c.d (mapped) and ::ffff:0:a.b.c.d (translated) carry an IPv4 address.
  if (zerosBefore(5) && at(5) === 0xffff) return isPrivateV4(embedded);
  if (zerosBefore(4) && at(4) === 0xffff && at(5) === 0) return isPrivateV4(embedded);
  // 64:ff9b::/96 is NAT64, which also carries an IPv4 address in the last 32 bits.
  if (at(0) === 0x64 && at(1) === 0xff9b && at(2) === 0 && at(3) === 0 && at(4) === 0) {
    if (at(5) === 0) return isPrivateV4(embedded);
  }
  // Public IPv6 addresses all sit in 2000::/3. Everything else is loopback (::1), unspecified
  // (::), unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8) or reserved.
  if ((at(0) & 0xe000) !== 0x2000) return true;
  if (at(0) === 0x2001 && at(1) < 0x200) return true; // 2001::/23, protocol assignments
  if (at(0) === 0x2001 && at(1) === 0xdb8) return true; // 2001:db8::/32, documentation
  if (at(0) === 0x2002) return isPrivateV4(at(1) * 2 ** 16 + at(2)); // 6to4 carries IPv4
  return false;
}

/** Strict dotted IPv4 like 192.168.0.1, as one number. Returns null for anything else. */
function parseIPv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let address = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    address = address * 256 + octet;
  }
  return address;
}

/** IPv6 as eight 16-bit groups, with :: and a trailing IPv4 part expanded. Null if invalid. */
function parseIPv6(value: string): number[] | null {
  let text = value;
  const tail: number[] = [];
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (lastColon === -1 || v4 === null) return null;
    tail.push(Math.floor(v4 / 2 ** 16), v4 % 2 ** 16);
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith("::")) text = text.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) =>
    part === ""
      ? []
      : part
          .split(":")
          .map((group) =>
            /^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN,
          );
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const known = [...head, ...rest, ...tail];
  if (known.some(Number.isNaN)) return null;
  if (halves.length === 1) return known.length === 8 ? known : null;
  if (known.length > 7) return null;
  return [...head, ...new Array<number>(8 - known.length).fill(0), ...rest, ...tail];
}

/** An error whose message is already plain English and safe to show to a person. */
class PreviewError extends Error {}

const defaultLookup = (hostname: string) => dnsLookup(hostname, { all: true });

/** Fetches a page and returns its preview. Throws an Error with a plain-English message on any refusal or failure. */
export async function fetchLinkPreview(url: string, deps: FetchDeps = {}): Promise<LinkPreview> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let target = checkTarget(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await checkHost(target, lookup, signal);
      const request = fetchImpl(target.href, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: ACCEPT },
        redirect: "manual",
        credentials: "omit",
        signal,
      });
      const response = await untilAborted(request, signal);
      if (!REDIRECT_STATUSES.has(response.status)) {
        return await readPreview(url, target, response, signal);
      }
      discard(response);
      if (hop === MAX_REDIRECTS) break;
      const location = response.headers.get("location");
      if (!location) throw new PreviewError("The page sent a redirect without saying where to.");
      target = checkTarget(location, target);
    }
    throw new PreviewError("The link redirects too many times.");
  } catch (error) {
    if (error instanceof PreviewError) throw error;
    if (signal.aborted) throw new PreviewError(TIMEOUT_MESSAGE, { cause: error });
    throw new PreviewError("The page could not be loaded.", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

/** Parses a URL (a redirect Location is resolved against `base`) and refuses unsafe ones. */
function checkTarget(raw: string, base?: URL): URL {
  const target = URL.parse(raw, base);
  if (!target) throw new PreviewError("This is not a valid web link.");
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new PreviewError("Only http and https links can be previewed.");
  }
  if (target.username || target.password) {
    throw new PreviewError("Links that contain a user name or password cannot be previewed.");
  }
  // The URL parser leaves the port empty when it is the default one for the scheme.
  if (target.port !== "") {
    throw new PreviewError("Links with a custom port number cannot be previewed.");
  }
  const host = target.hostname.replace(/\.$/, "");
  const local =
    host === "localhost" ||
    [".localhost", ".local", ".internal"].some((suffix) => host.endsWith(suffix)) ||
    (!host.includes(".") && !host.startsWith("["));
  if (local) throw new PreviewError("Links to local or internal addresses cannot be previewed.");
  return target;
}

const PRIVATE_MESSAGE = "This link points to a private network address, so it cannot be previewed.";

/** Refuses the request when the host is, or resolves to, a private address. */
async function checkHost(
  target: URL,
  lookup: NonNullable<FetchDeps["lookup"]>,
  signal: AbortSignal,
): Promise<void> {
  const host = target.hostname;
  if (host.startsWith("[") || parseIPv4(host) !== null) {
    if (isPrivateAddress(host)) throw new PreviewError(PRIVATE_MESSAGE);
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await untilAborted(lookup(host), signal);
  } catch (error) {
    if (error instanceof PreviewError) throw error;
    throw new PreviewError("The website for this link could not be found.", { cause: error });
  }
  if (addresses.length === 0) {
    throw new PreviewError("The website for this link could not be found.");
  }
  // Known gap: DNS can answer differently between this check and the request itself
  // (DNS rebinding). We accept that small risk here.
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new PreviewError(PRIVATE_MESSAGE);
  }
}

/** Turns the final response into a preview. Only HTML pages are read. */
async function readPreview(
  url: string,
  target: URL,
  response: Response,
  signal: AbortSignal,
): Promise<LinkPreview> {
  const finalUrl = target.href;
  if (!response.ok) {
    discard(response);
    throw new PreviewError(`The page answered with an error (status ${response.status}).`);
  }
  if (!HTML_TYPES.test(response.headers.get("content-type") ?? "")) {
    discard(response);
    return { url, finalUrl, title: null, description: null, imageUrl: null, siteName: null };
  }
  const html = await readHtml(response, signal);
  return { url, finalUrl, ...parsePreviewHtml(html, finalUrl) };
}

const HEAD_END = /<\/head\b/i;

/** Reads at most 512 KB of the body as UTF-8. It stops early once the </head> tag arrives. */
async function readHtml(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let html = "";
  let bytes = 0;
  try {
    while (bytes < MAX_BODY_BYTES) {
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) break;
      const chunk = value.subarray(0, MAX_BODY_BYTES - bytes);
      bytes += chunk.byteLength;
      const searchFrom = Math.max(0, html.length - 8);
      html += decoder.decode(chunk, { stream: true });
      if (HEAD_END.test(html.slice(searchFrom))) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return html + decoder.decode();
}

/** Lets go of a response body that is not needed, so the connection can close. */
function discard(response: Response): void {
  response.body?.cancel().catch(() => {});
}

/** Waits for a promise, but rejects with the timeout message as soon as the signal aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new PreviewError(TIMEOUT_MESSAGE));
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    promise.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      },
    );
  });
}
