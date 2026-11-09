// A stand-in for Buffer's OAuth server and GraphQL API, for local development and end-to-end
// tests without real Buffer credentials. It follows Buffer's documented rules: PKCE (S256),
// client_secret_post, single-use refresh tokens (reuse revokes the grant), the `iss` parameter,
// RateLimit headers and HTTP 401 for a bad access token.
//
// Run: node e2e/mock-buffer/server.ts   (listens on MOCK_BUFFER_PORT, default 4010)
// Then set BUFFER_AUTH_URL=http://localhost:4010 and BUFFER_API_URL=http://localhost:4010/graphql.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.MOCK_BUFFER_PORT ?? 4010);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = process.env.MOCK_BUFFER_CLIENT_ID ?? "mock-client";
const CLIENT_SECRET = process.env.MOCK_BUFFER_CLIENT_SECRET ?? "mock-secret";
const ACCESS_TTL_SECONDS = Number(process.env.MOCK_BUFFER_ACCESS_TTL ?? 3600);

interface MockChannel {
  id: string;
  service: string;
  name: string;
  displayName: string | null;
  isDisconnected: boolean;
  isQueuePaused: boolean;
  isLocked: boolean;
  /** Overrides the shared posting schedule, for example [] for a channel with no times. */
  postingSchedule?: { day: string; paused: boolean; times: string[] }[];
}

interface MockPost {
  id: string;
  channelId: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "error";
  dueAt: string | null;
  text: string;
  tagIds: string[];
  /** "buffer" for posts made in Buffer (or by an app), "network" for native ones. */
  via?: string;
  sentAt?: string | null;
  createdAt?: string;
  externalLink?: string | null;
  error?: { message: string; supportUrl: string | null } | null;
  /** Notes on the post, written through createCollaborationNote. Newest last. */
  notes?: { id: string; text: string; authorId: string; createdAt: string }[];
}

interface MockAccount {
  id: string;
  name: string;
  timezone: string;
  organizationId: string;
  channels: MockChannel[];
  posts: MockPost[];
  ideas: { id: string; title: string; templateId: string | null }[];
  tags: { id: string; name: string; color: string }[];
}

// A few public templates, two of them with Creator Camp's ID prefix.
const TEMPLATES = [
  {
    id: "6a7afa000000000000000001",
    emoji: "🔍",
    title: "What you are curious about",
    description: "Share a question on your mind.",
    body: "Lately I keep wondering about [topic].",
  },
  {
    id: "6a7afa000000000000000002",
    emoji: "🏅",
    title: "A small thing you are proud of",
    description: "Celebrate a quiet win.",
    body: "Small win: [win].",
  },
  {
    id: "5b1c00000000000000000003",
    emoji: "🧱",
    title: "Say what you are building",
    description: "Share this week's project.",
    body: "This week I am building [thing].",
  },
];

const schedule = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => ({
  day,
  paused: false,
  times: ["09:00", "17:30"],
}));

function freshAccounts(): Record<string, MockAccount> {
  return {
    ana: {
      id: "acc-ana",
      name: "Ana Popescu",
      timezone: "Europe/Bucharest",
      organizationId: "org-ana",
      posts: [],
      ideas: [],
      tags: [],
      channels: [
        {
          id: "ch-ana-li",
          service: "linkedin",
          name: "anapopescu",
          displayName: "Ana Popescu",
          isDisconnected: false,
          isQueuePaused: false,
          isLocked: false,
        },
        {
          id: "ch-ana-bsky",
          service: "bluesky",
          name: "ana.bsky.social",
          displayName: null,
          isDisconnected: false,
          isQueuePaused: true,
          isLocked: false,
        },
        {
          id: "ch-ana-ig",
          service: "instagram",
          name: "ana.makes",
          displayName: null,
          isDisconnected: true,
          isQueuePaused: false,
          isLocked: false,
        },
      ],
    },
    ben: {
      id: "acc-ben",
      name: "Ben Ionescu",
      timezone: "Europe/London",
      organizationId: "org-ben",
      posts: [],
      ideas: [],
      tags: [],
      channels: [
        {
          id: "ch-ben-masto",
          service: "mastodon",
          name: "ben@mastodon.social",
          displayName: "Ben on Mastodon",
          isDisconnected: false,
          isQueuePaused: false,
          isLocked: false,
        },
      ],
    },
    cara: {
      id: "acc-cara",
      name: "Cara Dumitru",
      timezone: "America/New_York",
      organizationId: "org-cara",
      posts: [],
      ideas: [],
      tags: [],
      channels: [],
    },
  };
}

interface Grant {
  account: string;
  scope: string;
  revoked: boolean;
}
interface PendingAuth {
  redirectUri: string;
  state: string;
  challenge: string;
  scope: string;
}
interface IssuedCode extends PendingAuth {
  account: string;
  expiresAt: number;
  used: boolean;
}

const state = {
  accounts: freshAccounts(),
  pending: new Map<string, PendingAuth>(),
  codes: new Map<string, IssuedCode>(),
  grants: new Map<string, Grant>(),
  access: new Map<string, { grantId: string; expiresAt: number }>(),
  refresh: new Map<string, { grantId: string; used: boolean }>(),
  /** Answer the next N GraphQL calls with HTTP 429. */
  rateLimitNext: 0,
  remaining15m: 110,
  log: [] as string[],
  ops: [] as string[],
};

const token = (prefix: string) => `${prefix}_${randomBytes(18).toString("base64url")}`;

function issueTokens(grantId: string) {
  const accessToken = token("mock_at");
  const refreshToken = token("mock_rt");
  state.access.set(accessToken, { grantId, expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000 });
  state.refresh.set(refreshToken, { grantId, used: false });
  const grant = state.grants.get(grantId);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    scope: grant?.scope ?? "",
  };
}

function revokeGrant(grantId: string) {
  const grant = state.grants.get(grantId);
  if (grant) grant.revoked = true;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const isString = typeof body === "string";
  res.writeHead(status, {
    "content-type": isString ? "text/html; charset=utf-8" : "application/json",
    ...headers,
  });
  res.end(isString ? body : JSON.stringify(body));
}

const oauthError = (res: ServerResponse, error: string, description: string, status = 400) =>
  send(res, status, { error, error_description: description });

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function consentPage(txId: string, pending: PendingAuth): string {
  const accounts = Object.entries(state.accounts)
    .map(
      ([key, account], index) =>
        `<label><input type="radio" name="account" value="${key}" ${index === 0 ? "checked" : ""}> ${escapeHtml(account.name)} (${account.channels.length} channels)</label>`,
    )
    .join("<br>");
  const scopes = pending.scope
    .split(" ")
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Buffer: approve access</title>
<style>body{font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{font-size:1rem;padding:.75rem 1.25rem;margin-right:.5rem}</style></head>
<body><p><strong>Mock Buffer</strong> (local test server, not the real Buffer)</p>
<h1>Allow this app to access your Buffer account?</h1>
<form method="get" action="/auth/decision">
<input type="hidden" name="tx" value="${txId}">
<fieldset><legend>Sign in as</legend>${accounts}</fieldset>
<p>Requested scopes:</p><ul>${scopes}</ul>
<button type="submit" name="decision" value="allow">Allow</button>
<button type="submit" name="decision" value="deny">Deny</button>
</form></body></html>`;
}

function avatarSvg(seed: string): string {
  const hue = [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="hsl(${hue} 60% 55%)"/><text x="40" y="52" font-size="34" text-anchor="middle" fill="white" font-family="system-ui">${escapeHtml(seed.slice(0, 1).toUpperCase())}</text></svg>`;
}

// The same shape api.buffer.com sends: short window names and a space after each ";".
// Quotas are Buffer's app-client base plus its per-user allowance for one user.
function rateLimitHeaders(remaining: number, reset = 600): Record<string, string> {
  const day = Math.max(0, remaining + 415);
  const month = Math.max(0, remaining + 14_990);
  return {
    ratelimit: `"15m"; r=${remaining}; t=${reset}, "24h"; r=${day}; t=86000, "30d"; r=${month}; t=2590000`,
    "ratelimit-policy": `"15m"; q=110; w=900; pk=:bW9jaw==:, "24h"; q=525; w=86400; pk=:bW9jaw==:, "30d"; q=15100; w=2592000; pk=:bW9jaw==:`,
  };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", ISSUER);
  state.log.push(`${req.method} ${url.pathname}`);

  if (req.method === "GET" && url.pathname === "/auth") {
    const q = url.searchParams;
    if (q.get("client_id") !== CLIENT_ID) return send(res, 400, "<p>Unknown client_id</p>");
    const redirectUri = q.get("redirect_uri") ?? "";
    if (!redirectUri) return send(res, 400, "<p>Missing redirect_uri</p>");
    if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256") {
      return send(res, 400, "<p>Only response_type=code with S256 PKCE is supported</p>");
    }
    const scope = q.get("scope") ?? "";
    const challenge = q.get("code_challenge") ?? "";
    if (!challenge || !scope.split(" ").includes("offline_access")) {
      return send(res, 400, "<p>Missing code_challenge or offline_access</p>");
    }
    const txId = token("tx");
    state.pending.set(txId, { redirectUri, state: q.get("state") ?? "", challenge, scope });
    return send(res, 200, consentPage(txId, state.pending.get(txId) as PendingAuth));
  }

  if (req.method === "GET" && url.pathname === "/auth/decision") {
    const pending = state.pending.get(url.searchParams.get("tx") ?? "");
    if (!pending) return send(res, 400, "<p>Unknown or used request</p>");
    state.pending.delete(url.searchParams.get("tx") ?? "");
    const back = new URL(pending.redirectUri);
    back.searchParams.set("state", pending.state);
    back.searchParams.set("iss", ISSUER);
    if (url.searchParams.get("decision") !== "allow") {
      back.searchParams.set("error", "access_denied");
    } else {
      const code = token("code");
      state.codes.set(code, {
        ...pending,
        account: url.searchParams.get("account") ?? "ana",
        expiresAt: Date.now() + 60_000,
        used: false,
      });
      back.searchParams.set("code", code);
    }
    res.writeHead(303, { location: back.toString() });
    return res.end();
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/token" || url.pathname === "/token/revocation")
  ) {
    const form = new URLSearchParams(await readBody(req));
    if (req.headers.authorization) {
      return oauthError(res, "invalid_client", "client_secret_basic is not supported", 401);
    }
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
      return oauthError(res, "invalid_client", "client authentication failed", 401);
    }

    if (url.pathname === "/token/revocation") {
      const value = form.get("token") ?? "";
      const grantId = state.refresh.get(value)?.grantId ?? state.access.get(value)?.grantId;
      if (grantId) revokeGrant(grantId);
      res.writeHead(200);
      return res.end();
    }

    if (form.get("grant_type") === "authorization_code") {
      const code = state.codes.get(form.get("code") ?? "");
      if (!code || code.used || code.expiresAt < Date.now()) {
        return oauthError(res, "invalid_grant", "Authorization code has expired");
      }
      code.used = true;
      if (code.redirectUri !== form.get("redirect_uri")) {
        return oauthError(res, "invalid_grant", "redirect_uri mismatch");
      }
      const verifier = form.get("code_verifier") ?? "";
      const expected = createHash("sha256").update(verifier).digest("base64url");
      if (expected !== code.challenge) return oauthError(res, "invalid_grant", "PKCE failed");
      const grantId = token("grant");
      state.grants.set(grantId, { account: code.account, scope: code.scope, revoked: false });
      return send(res, 200, issueTokens(grantId));
    }

    if (form.get("grant_type") === "refresh_token") {
      const entry = state.refresh.get(form.get("refresh_token") ?? "");
      if (!entry) return oauthError(res, "invalid_grant", "grant request is invalid");
      if (entry.used) {
        // Buffer: reusing an old refresh token revokes every token of the grant.
        revokeGrant(entry.grantId);
        return oauthError(res, "invalid_grant", "grant request is invalid");
      }
      if (state.grants.get(entry.grantId)?.revoked) {
        return oauthError(res, "invalid_grant", "grant request is invalid");
      }
      entry.used = true;
      return send(res, 200, issueTokens(entry.grantId));
    }
    return oauthError(res, "unsupported_grant_type", "unsupported grant_type");
  }

  if (req.method === "POST" && url.pathname === "/graphql") {
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const access = state.access.get(bearer);
    const grant = access ? state.grants.get(access.grantId) : undefined;
    if (!access || !grant || grant.revoked || access.expiresAt < Date.now()) {
      return send(res, 401, {
        errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }],
      });
    }
    if (state.rateLimitNext > 0) {
      state.rateLimitNext -= 1;
      return send(
        res,
        429,
        {
          errors: [
            {
              message: "Too many requests from this client. Please try again later.",
              extensions: { code: "RATE_LIMIT_EXCEEDED", window: "15m" },
            },
          ],
        },
        { "retry-after": "240", ...rateLimitHeaders(0, 240) },
      );
    }
    state.remaining15m = Math.max(0, state.remaining15m - 1);
    const headers = rateLimitHeaders(state.remaining15m);
    const body = JSON.parse(await readBody(req)) as {
      query: string;
      variables?: Record<string, unknown>;
    };
    // The operation name, for debugging which calls a test made (GET /__control lists them).
    state.ops.push(/(?:query|mutation) (\w+)/.exec(body.query)?.[1] ?? "unknown");
    const account = state.accounts[grant.account];
    if (!account)
      return send(
        res,
        200,
        { errors: [{ message: "No account", extensions: { code: "NOT_FOUND" } }] },
        headers,
      );

    if (/\bquery Account\b/.test(body.query)) {
      return send(
        res,
        200,
        {
          data: {
            account: {
              id: account.id,
              name: account.name,
              avatar: `${ISSUER}/avatar/${encodeURIComponent(account.name)}.svg`,
              timezone: account.timezone,
              organizations: [
                { id: account.organizationId, name: `${account.name}'s organization` },
              ],
            },
          },
        },
        headers,
      );
    }
    if (/\bquery Channels\b/.test(body.query)) {
      if (body.variables?.organizationId !== account.organizationId) {
        return send(
          res,
          200,
          { errors: [{ message: "Organization not found", extensions: { code: "FORBIDDEN" } }] },
          headers,
        );
      }
      return send(
        res,
        200,
        {
          data: {
            channels: account.channels.map((c) => ({
              ...c,
              organizationId: account.organizationId,
              avatar: `${ISSUER}/avatar/${encodeURIComponent(c.name)}.svg`,
              timezone: account.timezone,
              postingSchedule: c.postingSchedule ?? schedule,
            })),
          },
        },
        headers,
      );
    }
    const v = body.variables ?? {};
    const input = (v.input ?? {}) as Record<string, unknown>;
    if (/\bquery PublicTemplates\b/.test(body.query)) {
      return send(
        res,
        200,
        {
          data: {
            postTemplates: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: TEMPLATES.map((node) => ({ node })),
            },
          },
        },
        headers,
      );
    }
    if (/\bmutation CreateIdea\b/.test(body.query)) {
      const content = (input.content ?? {}) as { title?: string };
      const idea = {
        id: token("idea"),
        title: content.title ?? "",
        templateId: (input.templateId as string) ?? null,
      };
      account.ideas.push(idea);
      return send(res, 200, { data: { createIdea: { __typename: "Idea", id: idea.id } } }, headers);
    }
    if (/\bmutation CreateDraft\b/.test(body.query)) {
      const channel = account.channels.find((c) => c.id === input.channelId);
      if (!channel) {
        return send(
          res,
          200,
          { data: { createPost: { __typename: "NotFoundError", message: "Channel not found" } } },
          headers,
        );
      }
      const post: MockPost = {
        id: token("post"),
        channelId: channel.id,
        status: input.saveToDraft ? "draft" : "scheduled",
        dueAt: (input.dueAt as string) ?? null,
        text: (input.text as string) ?? "",
        tagIds: (input.tagIds as string[]) ?? [],
        createdAt: new Date().toISOString(),
      };
      account.posts.push(post);
      return send(
        res,
        200,
        {
          data: {
            createPost: {
              __typename: "PostActionSuccess",
              post: {
                id: post.id,
                status: post.status,
                dueAt: post.dueAt,
                channelId: post.channelId,
              },
            },
          },
        },
        headers,
      );
    }
    if (/\bquery Tags\b/.test(body.query)) {
      return send(
        res,
        200,
        {
          data: {
            tagsV2: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: account.tags.map((t) => ({ node: { id: t.id, name: t.name } })),
            },
          },
        },
        headers,
      );
    }
    if (/\bmutation CreateTag\b/.test(body.query)) {
      const tag = (input.tag ?? {}) as { name?: string; color?: string };
      if (account.tags.some((t) => t.name === tag.name)) {
        return send(
          res,
          200,
          {
            data: {
              createTag: { __typename: "DuplicateError", message: "A tag with this name exists" },
            },
          },
          headers,
        );
      }
      const created = { id: token("tag"), name: tag.name ?? "", color: tag.color ?? "#000000" };
      account.tags.push(created);
      return send(
        res,
        200,
        {
          data: {
            createTag: {
              __typename: "TagActionSuccess",
              tag: { id: created.id, name: created.name },
            },
          },
        },
        headers,
      );
    }
    if (/\bquery ScheduledPosts\b/.test(body.query)) {
      const ids = (v.channelIds as string[]) ?? [];
      const posts = account.posts.filter((p) => ids.includes(p.channelId) && p.dueAt);
      return send(
        res,
        200,
        {
          data: {
            posts: {
              edges: posts.map((p) => ({
                node: { id: p.id, channelId: p.channelId, status: p.status, dueAt: p.dueAt },
              })),
            },
          },
        },
        headers,
      );
    }
    if (/\bquery ParticipantPosts\b/.test(body.query)) {
      const ids = (v.channelIds as string[]) ?? [];
      const since = Date.parse(v.since as string);
      const posts = account.posts.filter(
        (p) => ids.includes(p.channelId) && Date.parse(p.createdAt ?? "1970-01-01") >= since,
      );
      return send(
        res,
        200,
        {
          data: {
            posts: {
              edges: posts.map((p) => ({
                node: {
                  id: p.id,
                  text: p.text,
                  status: p.status,
                  via: p.via ?? "buffer",
                  dueAt: p.dueAt,
                  sentAt: p.sentAt ?? null,
                  createdAt: p.createdAt ?? new Date().toISOString(),
                  externalLink: p.externalLink ?? null,
                  channelId: p.channelId,
                  tags: p.tagIds.map((id) => ({ id })),
                  error: p.error ?? null,
                },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
        headers,
      );
    }
    if (/\bmutation TagPost\b/.test(body.query)) {
      const post = account.posts.find((p) => p.id === input.id);
      if (post) post.tagIds = (input.tagIds as string[]) ?? post.tagIds;
      return send(
        res,
        200,
        {
          data: {
            editPost: post
              ? { __typename: "PostActionSuccess" }
              : { __typename: "NotFoundError", message: "Post not found" },
          },
        },
        headers,
      );
    }
    if (/\bquery WeekPostingLimits\b/.test(body.query)) {
      const ids = (v.channelIds as string[]) ?? [];
      const day = ids.map((channelId) => ({ channelId, isAtLimit: false }));
      return send(
        res,
        200,
        { data: { d0: day, d1: day, d2: day, d3: day, d4: day, d5: day, d6: day } },
        headers,
      );
    }
    if (/\bquery PostText\b/.test(body.query)) {
      // Buffer only shows a post to an account that can see it.
      const post = account.posts.find((p) => p.id === v.id);
      if (!post) {
        return send(
          res,
          200,
          { errors: [{ message: "Post not found", extensions: { code: "NOT_FOUND" } }] },
          headers,
        );
      }
      return send(
        res,
        200,
        {
          data: {
            post: { id: post.id, text: post.text, status: post.status, channelId: post.channelId },
          },
        },
        headers,
      );
    }
    if (/\bmutation CreateCollaborationNote\b/.test(body.query)) {
      // Notes need the experimental notes:write scope, as on the real API.
      if (!grant.scope.split(" ").includes("notes:write")) {
        return send(
          res,
          200,
          {
            errors: [
              { message: "Missing scope notes:write", extensions: { code: "INSUFFICIENT_SCOPE" } },
            ],
          },
          headers,
        );
      }
      const subject = (input.subject ?? {}) as { postId?: string };
      const post = account.posts.find((p) => p.id === subject.postId);
      if (!post) {
        return send(
          res,
          200,
          {
            data: {
              createCollaborationNote: {
                __typename: "InvalidInputError",
                message: "Post not found",
              },
            },
          },
          headers,
        );
      }
      const note = {
        id: token("note"),
        text: (input.text as string) ?? "",
        authorId: account.id,
        createdAt: new Date().toISOString(),
      };
      post.notes = [...(post.notes ?? []), note];
      return send(
        res,
        200,
        {
          data: {
            createCollaborationNote: {
              __typename: "CreateCollaborationNoteSuccess",
              edge: { node: { id: note.id } },
            },
          },
        },
        headers,
      );
    }
    return send(
      res,
      200,
      {
        errors: [
          {
            message: "The mock does not support this operation",
            extensions: { code: "UNEXPECTED" },
          },
        ],
      },
      headers,
    );
  }

  if (req.method === "GET" && url.pathname.startsWith("/avatar/")) {
    const seed = decodeURIComponent(url.pathname.slice("/avatar/".length).replace(/\.svg$/, ""));
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=3600" });
    return res.end(avatarSvg(seed));
  }

  // Test controls. Not part of Buffer's API.
  if (req.method === "POST" && url.pathname === "/__control") {
    const command = JSON.parse((await readBody(req)) || "{}") as {
      action:
        | "reset"
        | "rate-limit"
        | "revoke-all"
        | "expire-access"
        | "set-channel"
        | "add-post"
        | "set-post"
        | "set-account";
      count?: number;
      account?: string;
      channelId?: string;
      patch?: Partial<MockChannel>;
      add?: MockChannel;
      /** For "add-post" and "set-post": a post written in Buffer, or changes to one. */
      post?: Partial<MockPost>;
      postId?: string;
      /** For "set-account": a new name, as if the person renamed their Buffer account. */
      name?: string;
    };
    switch (command.action) {
      case "reset":
        Object.assign(state, {
          accounts: freshAccounts(),
          rateLimitNext: 0,
          remaining15m: 110,
          log: [],
          ops: [],
        });
        state.pending.clear();
        state.codes.clear();
        state.grants.clear();
        state.access.clear();
        state.refresh.clear();
        break;
      case "rate-limit":
        state.rateLimitNext = command.count ?? 1;
        break;
      case "revoke-all":
        for (const id of state.grants.keys()) revokeGrant(id);
        break;
      case "expire-access":
        for (const entry of state.access.values()) entry.expiresAt = 0;
        break;
      case "add-post": {
        // A post the person wrote in Buffer itself, not from a Daydeck prompt.
        const account = state.accounts[command.account ?? "ana"];
        if (!account || !command.post?.channelId) break;
        account.posts.push({
          id: token("post"),
          status: "scheduled",
          dueAt: null,
          text: "",
          tagIds: [],
          via: "buffer",
          createdAt: new Date().toISOString(),
          ...command.post,
        } as MockPost);
        break;
      }
      case "set-post": {
        // Changes a post as if the person or Buffer did: scheduled, sent or failed.
        const account = state.accounts[command.account ?? "ana"];
        const post = account?.posts.find((p) => p.id === command.postId);
        if (post && command.post) Object.assign(post, command.post);
        break;
      }
      case "set-account": {
        const account = state.accounts[command.account ?? "ana"];
        if (account && command.name) account.name = command.name;
        break;
      }
      case "set-channel": {
        const account = state.accounts[command.account ?? "ana"];
        if (!account) break;
        if (command.add) account.channels.push(command.add);
        const channel = account.channels.find((c) => c.id === command.channelId);
        if (channel && command.patch) Object.assign(channel, command.patch);
        break;
      }
    }
    return send(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/__control") {
    return send(res, 200, {
      grants: [...state.grants.values()],
      tokenCalls: state.log.filter((l) => l === "POST /token").length,
      graphqlCalls: state.log.filter((l) => l === "POST /graphql").length,
      ops: state.ops,
      accounts: Object.fromEntries(
        Object.entries(state.accounts).map(([key, a]) => [
          key,
          { posts: a.posts, ideas: a.ideas, tags: a.tags },
        ]),
      ),
      log: state.log.slice(-50),
    });
  }

  send(res, 404, { error: "not_found" });
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error(error);
    send(res, 500, { error: "server_error" });
  });
}).listen(PORT, () => console.warn(`Mock Buffer listening on ${ISSUER}`));
