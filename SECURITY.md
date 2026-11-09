# Security policy

Daydeck holds access to people's Buffer accounts, so security reports matter a lot. Thank you
for taking the time to send one.

## Report a vulnerability

Please report a vulnerability privately. Do not open a public issue, discussion or pull
request for it, because that shows the problem to everyone before a fix exists.

1. Open this repository on GitHub and go to the **Security** tab.
2. Choose **Report a vulnerability**. This opens a private security advisory: a private
   conversation between you and the maintainer, inside GitHub.
3. Describe the problem, the steps to reproduce it, the files or routes involved, and what an
   attacker could do with it.

The maintainer answers in the same advisory. When a fix is ready, the advisory can be
published with credit to you, if you want it.

When you test, use your own deployment or the mock Buffer server (see
[CONTRIBUTING.md](CONTRIBUTING.md)). Never use other people's Buffer accounts or data.

## Supported versions

Daydeck has no versioned releases. Security fixes go to the `main` branch only.

## Scope

- **In scope:** the code in this repository.
- **Out of scope:** Buffer's own API, OAuth server and apps. Report those to Buffer. The same
  applies to the hosting and service providers (Vercel, Neon, Inngest, Sentry).

## How Daydeck protects data

A short summary of the security design. Each point names the code that does it.

- **Buffer tokens are encrypted at rest.** Access tokens and refresh tokens are encrypted with
  AES-256-GCM before they are saved in Postgres (`apps/web/server/crypto/vault.ts`). The
  32-byte master key comes from the `TOKEN_ENCRYPTION_KEY` environment variable. Each use
  gets its own key, derived with HKDF (a standard way to turn one master key into several
  separate keys). Each token is also bound to its user and field, so a token copied to another
  row fails to decrypt.
- **OAuth 2.0 with PKCE and state.** Connecting Buffer uses the Authorization Code flow with
  PKCE (Proof Key for Code Exchange, method S256). With PKCE, a stolen authorization code is
  useless without a secret verifier that stays on the server. A random `state` value ties
  Buffer's redirect to the browser that started the flow, and the server compares it in
  constant time. The state and the verifier travel in an encrypted cookie that lasts 10
  minutes. The callback also checks the `iss` parameter (RFC 9207), which blocks "mix-up"
  attacks between OAuth servers. See `apps/web/app/api/auth/buffer/` and
  `packages/buffer/src/oauth.ts`.
- **Confidential client.** Daydeck is a confidential OAuth client: the client secret lives
  only in server environment variables, and only the server sends it to Buffer. It never
  appears in the code or in the browser.
- **Only usable grants are kept.** A grant is the permission a person gives Daydeck on Buffer's
  consent screen. If a grant lacks a scope the app cannot work without (`account:read` or
  `offline_access`), the callback revokes it at Buffer and does not store it. When a person connects again, the app revokes their old
  grant.
- **Hashed database sessions.** The session cookie holds a random 32-byte ID. The database
  stores only the SHA-256 hash of that ID, so a copy of the database contains no working
  sessions (`apps/web/server/auth/sessions.ts`). The cookie is `HttpOnly`, `Secure` and
  `SameSite=Lax`, and its name starts with `__Host-`, so the browser accepts it only over HTTPS
  and only for this exact host. Every sign-in creates a new session ID and deletes the old one.
- **Refresh-token rotation under a row lock.** Buffer issues a new refresh token on every
  refresh and revokes the whole grant if an old refresh token is used again. So a refresh runs
  inside a database transaction that locks the person's connection row with
  `SELECT ... FOR UPDATE`. It reads the row again after it takes the lock, and it saves the new
  refresh token before anyone uses the new access token (`apps/web/server/buffer/tokens.ts`).
  A test makes two refreshes race, and CI runs it against a real Postgres.
- **Almost no post text is stored.** A progress check keeps only a SHA-256 hash of each post's
  text, to notice when a post changes. While a post written outside Daydeck waits for its day,
  `seen_posts.preview` keeps its first 100 characters (a database check caps it); the daily
  purge clears it once the post has a day, its challenge closes, or after 30 days. The other
  exception is a draft a participant chooses to
  share with their group for feedback: Daydeck keeps that copy so the group can read it
  (`feedback_requests.draft_snapshot`, `apps/web/server/feedback/`). A draft that a participant edits on a prompt card stays in
  that browser tab's session storage. When `MATCHER_PROVIDER` is `jev` or `llm`, a progress
  check sends the text of a post written outside Daydeck, with the candidate prompts, to that
  provider's API to find the day it answers. Daydeck does not save that text. With `keyword`,
  matching runs on Daydeck's own server.
- **Error reports leave secrets out.** Sentry is off unless a DSN is set. It collects no
  cookies, headers, request bodies, query strings or user details, and a `beforeSend` hook
  replaces any field whose name looks like a token, secret, cookie or session with
  `[redacted]` (`apps/web/lib/sentry-scrub.ts`).
- **Deletion on request and after 30 days.** "Your data" (`/settings/data`) revokes the
  Buffer grant at Buffer and deletes the person with everything linked to them, then shows
  exactly what was removed (`apps/web/server/account/data.ts`). A daily job closes finished
  challenges, and another deletes a closed challenge with all its data 30 days later, link
  previews after a week and rate-limit counters after a day
  (`apps/web/server/account/retention.ts`, `apps/web/inngest/functions.ts`).
- **Rate limits on Daydeck's own endpoints.** Connecting Buffer is limited per IP address, and
  saving, checking, joining, hosting, answering and the live board are limited per person.
  The counters live in Postgres, so every server instance shares them, and IP addresses are
  stored only as salted hashes (`apps/web/server/security/rate-limit.ts`).
- **Every action checks who is asking.** Server actions read the session again, validate input
  with Zod, and only change the caller's own rows; hosts alone can close their challenge.
- **Other safeguards.**
  - `apps/web/next.config.ts` sends security headers on every page: a Content Security Policy
    (scripts, connections, forms and frames limited to Daydeck itself; no plugins), HSTS
    (browsers then use only HTTPS), `X-Frame-Options: DENY`, `X-Content-Type-Options:
    nosniff`, a referrer policy and a permissions policy. The policy allows inline scripts,
    because a nonce-based policy would turn off Next.js partial prerendering.
  - The path to return to after connecting is checked, which blocks open redirects
    (`apps/web/server/auth/next-path.ts`).
  - Database connections verify the server's TLS certificate (`sslmode=verify-full`).
  - Invite codes hold 128 random bits.
  - In production, the background job endpoint `/api/inngest` accepts only requests signed
    with `INNGEST_SIGNING_KEY`.
  - CI scans every push and pull request for committed secrets with gitleaks.
