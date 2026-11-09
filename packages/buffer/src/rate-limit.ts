// Parses Buffer's rate-limit headers (IETF "RateLimit" header fields, structured-field lists).
// Buffer sends one list member per window, as seen from api.buffer.com in November 2026:
//
//   RateLimit:        "15m"; r=101; t=769, "24h"; r=516; t=86269, "30d"; r=15091; t=2591869
//   RateLimit-Policy: "15m"; q=110; w=900; pk=:...:, "24h"; q=525; w=86400; pk=:...:, ...
//
// r = requests remaining, t = seconds until the window resets, q = quota, w = window length in
// seconds. The two headers are joined on the quoted policy name. (Buffer's docs show names such
// as "100-in-15min"; both forms are understood.)

export interface RateLimitWindow {
  /** The policy name, for example "15m". */
  policy: string;
  /** Window length: 900, 86,400 or 2,592,000 seconds. */
  windowSeconds: number;
  quota: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

interface ListMember {
  name: string;
  params: Map<string, string>;
}

/** Reads every window from a response's headers. Unknown or broken members are skipped. */
export function parseRateLimitHeaders(headers: Headers): RateLimitWindow[] {
  const limits = parseList(headers.get("ratelimit"));
  const policies = new Map(parseList(headers.get("ratelimit-policy")).map((m) => [m.name, m]));

  const windows: RateLimitWindow[] = [];
  for (const limit of limits) {
    const policy = policies.get(limit.name);
    const inferred = inferFromName(limit.name);
    const windowSeconds = toInt(policy?.params.get("w")) ?? inferred?.windowSeconds;
    const quota = toInt(policy?.params.get("q")) ?? inferred?.quota;
    const remaining = toInt(limit.params.get("r"));
    const resetSeconds = toInt(limit.params.get("t"));
    if (
      windowSeconds === undefined ||
      quota === undefined ||
      remaining === undefined ||
      resetSeconds === undefined
    ) {
      continue;
    }
    windows.push({ policy: limit.name, windowSeconds, quota, remaining, resetSeconds });
  }
  return windows;
}

/** Retry-After in seconds. Accepts a number of seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

// Splits a structured-field list on commas that are outside quoted strings.
function parseList(value: string | null): ListMember[] {
  if (!value) return [];
  const members: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && inQuotes) {
      current += char + (value[i + 1] ?? "");
      i++;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    if (char === "," && !inQuotes) {
      members.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  members.push(current);
  return members.map(parseMember).filter((m): m is ListMember => m !== null);
}

function parseMember(raw: string): ListMember | null {
  const text = raw.trim();
  if (!text) return null;

  let name: string;
  let rest: string;
  if (text.startsWith('"')) {
    const end = findClosingQuote(text);
    if (end === -1) return null;
    name = text.slice(1, end).replace(/\\(.)/g, "$1");
    rest = text.slice(end + 1);
  } else {
    const semicolon = text.indexOf(";");
    name = semicolon === -1 ? text : text.slice(0, semicolon);
    rest = semicolon === -1 ? "" : text.slice(semicolon);
  }

  const params = new Map<string, string>();
  for (const part of rest.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (!key) continue;
    params.set(key.trim().toLowerCase(), valueParts.join("=").trim());
  }
  return { name: name.trim(), params };
}

function findClosingQuote(text: string): number {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === '"') return i;
  }
  return -1;
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

const UNIT_SECONDS: Record<string, number> = {
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

// Fallback when RateLimit-Policy is missing. "100-in-15min" gives the quota and the window;
// Buffer's short names such as "15m" give only the window, so the quota stays unknown.
function inferFromName(name: string): { quota?: number; windowSeconds: number } | undefined {
  const long = /^(\d+)-in-(\d+)([a-z]+)$/i.exec(name);
  const short = /^(\d+)([a-z]+)$/i.exec(name);
  const [quota, count, unit] = long ? long.slice(1) : short ? [undefined, ...short.slice(1)] : [];
  const seconds = UNIT_SECONDS[unit?.toLowerCase() ?? ""];
  if (!seconds || !count) return undefined;
  return {
    quota: quota === undefined ? undefined : Number(quota),
    windowSeconds: Number(count) * seconds,
  };
}
