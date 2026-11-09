import { describe, expect, it } from "vitest";
import {
  fetchLinkPreview,
  firstLink,
  isPrivateAddress,
  parsePreviewHtml,
  serviceForUrl,
} from "./link-preview";

// Fakes for the network: a fetch that answers from a route table, and a DNS lookup table.
type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: no route for ${url}`);
    return route(init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function fakeLookup(table: Record<string, string[]>) {
  const asked: string[] = [];
  const lookup = async (hostname: string) => {
    asked.push(hostname);
    const addresses = table[hostname];
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { lookup, asked };
}

const PUBLIC_IP = "93.184.216.34";

function htmlResponse(body: string | ReadableStream, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

describe("firstLink", () => {
  it("finds a link and leaves trailing punctuation out", () => {
    expect(firstLink("Day 3 done! https://www.linkedin.com/posts/abc.")).toBe(
      "https://www.linkedin.com/posts/abc",
    );
    expect(firstLink("(see https://x.com/user/status/1)")).toBe("https://x.com/user/status/1");
    expect(firstLink("Wow https://example.com/a?b=c!?")).toBe("https://example.com/a?b=c");
    expect(firstLink("Look: https://bsky.app/profile/a/post/1, nice")).toBe(
      "https://bsky.app/profile/a/post/1",
    );
    expect(firstLink("[post](https://threads.net/@a/post/1)")).toBe(
      "https://threads.net/@a/post/1",
    );
    expect(firstLink("<https://example.com>")).toBe("https://example.com");
  });

  it("keeps brackets that belong to the link", () => {
    expect(firstLink("Read https://en.wikipedia.org/wiki/Foo_(bar).")).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    );
  });

  it("returns null when there is no http(s) link", () => {
    expect(firstLink("no links here")).toBeNull();
    expect(firstLink("")).toBeNull();
    expect(firstLink("www.example.com and ftp://example.com")).toBeNull();
    expect(firstLink("just https:// on its own")).toBeNull();
  });

  it("returns the first of several links", () => {
    expect(firstLink("first http://a.example/1 then https://b.example/2")).toBe(
      "http://a.example/1",
    );
    expect(firstLink("HTTPS://Example.com/x")).toBe("HTTPS://Example.com/x");
  });

  it("skips links longer than 2000 characters", () => {
    const long = `https://example.com/${"a".repeat(2000)}`;
    expect(firstLink(long)).toBeNull();
    expect(firstLink(`${long} https://short.example/ok`)).toBe("https://short.example/ok");
    const fits = `https://example.com/${"a".repeat(2000 - 20)}`;
    expect(fits).toHaveLength(2000);
    expect(firstLink(fits)).toBe(fits);
  });
});

describe("serviceForUrl", () => {
  const cases: [string, string | null][] = [
    ["https://www.linkedin.com/posts/abc", "linkedin"],
    ["https://uk.linkedin.com/in/someone", "linkedin"],
    ["https://lnkd.in/abc", "linkedin"],
    ["https://x.com/user/status/1", "twitter"],
    ["https://mobile.twitter.com/user/status/1", "twitter"],
    ["https://t.co/abc", "twitter"],
    ["https://www.instagram.com/p/abc/", "instagram"],
    ["https://instagr.am/p/abc", "instagram"],
    ["https://bsky.app/profile/a.bsky.social/post/1", "bluesky"],
    ["https://www.threads.net/@a/post/1", "threads"],
    ["https://www.threads.com/@a/post/1", "threads"],
    ["https://www.tiktok.com/@a/video/1", "tiktok"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://m.facebook.com/story.php?id=1", "facebook"],
    ["https://fb.com/a", "facebook"],
    ["https://fb.watch/abc", "facebook"],
    ["https://www.pinterest.com/pin/1", "pinterest"],
    ["https://pin.it/abc", "pinterest"],
    ["https://substack.com/@a/note/1", "substack"],
    ["https://someone.substack.com/p/post", "substack"],
    ["https://mastodon.social/@a/1", "mastodon"],
    ["https://mstdn.social/about", "mastodon"],
    ["https://hachyderm.io/@someone/112233445566", "mastodon"],
    ["https://WWW.LinkedIn.COM./posts/abc", "linkedin"],
    ["https://example.com/", null],
    ["https://notlinkedin.com/posts", null],
    ["https://linkedin.com.evil.example/posts", null],
    ["https://medium.com/@someone/a-story-1a2b3c", null],
    ["https://hachyderm.io/@someone", null],
    ["ftp://linkedin.com/file", null],
    ["not a url", null],
  ];

  it.each(cases)("%s is %s", (url, service) => {
    expect(serviceForUrl(url)).toBe(service);
  });
});

describe("parsePreviewHtml", () => {
  const base = "https://example.com/posts/1";

  it("reads Open Graph tags", () => {
    const html = `<!doctype html><html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Day 3 of 30">
      <meta property="og:description" content="  A   post
        about  building.  ">
      <meta property="og:image" content="https://cdn.example.com/card.png" />
      <meta property="og:site_name" content="LinkedIn">
      </head><body></body></html>`;
    expect(parsePreviewHtml(html, base)).toEqual({
      title: "Day 3 of 30",
      description: "A post about building.",
      imageUrl: "https://cdn.example.com/card.png",
      siteName: "LinkedIn",
    });
  });

  it("falls back to twitter tags", () => {
    const html = `<head>
      <meta name="twitter:title" content="Tweet title">
      <meta name="twitter:description" content="Tweet text">
      <meta name="twitter:image" content="https://pbs.example.com/a.jpg">
      </head>`;
    expect(parsePreviewHtml(html, base)).toEqual({
      title: "Tweet title",
      description: "Tweet text",
      imageUrl: "https://pbs.example.com/a.jpg",
      siteName: null,
    });
  });

  it("falls back to <title> and meta description, also when og tags are empty", () => {
    const html = `<head><meta property="og:title" content="   ">
      <title>  My
        page </title><meta name="description" content="Plain description"></head>`;
    const preview = parsePreviewHtml(html, base);
    expect(preview.title).toBe("My page");
    expect(preview.description).toBe("Plain description");
  });

  it("decodes HTML entities", () => {
    const html = `<head>
      <meta property="og:title" content="Tom &amp; Jerry&#39;s &quot;show&quot; &#x27;hi&#x27; &lt;3 &#8364;5">
      <meta property="og:description" content="a&nbsp;b &amp;quot; &unknown; AT&T">
      <meta property="og:site_name" content="Wait&hellip; &#0;&#xD800;">
      <title>ignored</title></head>`;
    const preview = parsePreviewHtml(html, base);
    expect(preview.title).toBe(`Tom & Jerry's "show" 'hi' <3 €5`);
    expect(preview.description).toBe("a b &quot; &unknown; AT&T");
    const replacement = String.fromCodePoint(0xfffd);
    expect(preview.siteName).toBe(`Wait… ${replacement}${replacement}`);
  });

  it("resolves a relative image and keeps only https images", () => {
    const image = (content: string, baseUrl = base) =>
      parsePreviewHtml(`<head><meta property="og:image" content="${content}"></head>`, baseUrl)
        .imageUrl;
    expect(image("/img/a.png")).toBe("https://example.com/img/a.png");
    expect(image("../b.png")).toBe("https://example.com/b.png");
    expect(image("//cdn.example.com/c.png")).toBe("https://cdn.example.com/c.png");
    expect(image("/a.png?x=1&amp;y=2")).toBe("https://example.com/a.png?x=1&y=2");
    expect(image("http://insecure.example.com/a.png")).toBeNull();
    expect(image("data:image/png;base64,AAAA")).toBeNull();
    expect(image("/a.png", "http://example.com/post")).toBeNull();
  });

  it("uses a later https image when the first one is not https", () => {
    const html = `<head><meta property="og:image" content="http://example.com/a.png">
      <meta property="og:image:secure_url" content="https://example.com/a.png"></head>`;
    expect(parsePreviewHtml(html, base).imageUrl).toBe("https://example.com/a.png");
  });

  it("cuts a long description to 300 characters with an ellipsis", () => {
    const html = `<head><meta property="og:description" content="${"word ".repeat(100)}"></head>`;
    const description = parsePreviewHtml(html, base).description ?? "";
    expect(description.length).toBeLessThanOrEqual(300);
    expect(description.endsWith("…")).toBe(true);
    expect(description.startsWith("word word")).toBe(true);
    const exact = `<head><meta property="og:description" content="${"a".repeat(300)}"></head>`;
    expect(parsePreviewHtml(exact, base).description).toBe("a".repeat(300));
  });

  it("handles attribute order, quotes, case and > inside values", () => {
    const html = `<HEAD>
      <META CONTENT='Single quoted' PROPERTY='OG:TITLE'>
      <meta content="a > b" property="og:description">
      <meta property=og:site_name content=Unquoted>
      </HEAD>`;
    expect(parsePreviewHtml(html, base)).toEqual({
      title: "Single quoted",
      description: "a > b",
      imageUrl: null,
      siteName: "Unquoted",
    });
  });

  it("ignores tags in comments, scripts and the body", () => {
    const html = `<head>
      <!-- <meta property="og:title" content="From a comment"> -->
      <script>var s = '<meta property="og:title" content="From a script">';</script>
      <meta property="og:title" content="Real title">
      </head><body>
      <meta property="og:description" content="From the body">
      <svg><title>Icon</title></svg></body>`;
    expect(parsePreviewHtml(html, base)).toEqual({
      title: "Real title",
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("returns nulls for a page without tags", () => {
    expect(parsePreviewHtml("", base)).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
    expect(parsePreviewHtml("<p>not <b>html head</p", base).title).toBeNull();
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "[::1]",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::",
    "not an ip",
    "",
  ])("%s is private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "1.1.1.1",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "192.169.0.1",
    "169.255.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a00:1450:4001:82a::200e",
    "::ffff:8.8.8.8",
  ])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("fetchLinkPreview", () => {
  const PAGE = `<!doctype html><html><head>
    <meta property="og:title" content="Day 3 of 30: shipping &amp; learning">
    <meta property="og:description" content="Building in public.">
    <meta property="og:image" content="/images/card.png">
    <meta property="og:site_name" content="Example">
    </head><body>Hello</body></html>`;

  it("fetches a page and returns its preview", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "https://example.com/post/1": () => htmlResponse(PAGE),
    });
    const { lookup, asked } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const preview = await fetchLinkPreview("https://example.com/post/1", { fetchImpl, lookup });
    expect(preview).toEqual({
      url: "https://example.com/post/1",
      finalUrl: "https://example.com/post/1",
      title: "Day 3 of 30: shipping & learning",
      description: "Building in public.",
      imageUrl: "https://example.com/images/card.png",
      siteName: "Example",
    });
    expect(asked).toEqual(["example.com"]);
    expect(calls).toHaveLength(1);
    const init = calls[0]?.init;
    const headers = new Headers(init?.headers);
    expect(headers.get("user-agent")).toBe(
      "Mozilla/5.0 (compatible; DaydeckBot/1.0; +https://daydeck.app)",
    );
    expect(headers.get("accept")).toBe("text/html,application/xhtml+xml");
    expect(headers.get("cookie")).toBeNull();
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("omit");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("follows a relative redirect and reports the final URL", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "https://lnkd.in/abc": () => redirect("https://www.example.com/start", 301),
      "https://www.example.com/start": () => redirect("/real?x=1", 307),
      "https://www.example.com/real?x=1": () => htmlResponse(PAGE),
    });
    const { lookup, asked } = fakeLookup({
      "lnkd.in": [PUBLIC_IP],
      "www.example.com": [PUBLIC_IP, "2606:4700:4700::1111"],
    });
    const preview = await fetchLinkPreview("https://lnkd.in/abc", { fetchImpl, lookup });
    expect(preview.url).toBe("https://lnkd.in/abc");
    expect(preview.finalUrl).toBe("https://www.example.com/real?x=1");
    expect(preview.imageUrl).toBe("https://www.example.com/images/card.png");
    expect(calls).toHaveLength(3);
    // Every hop is checked again, also when the host stays the same.
    expect(asked).toEqual(["lnkd.in", "www.example.com", "www.example.com"]);
  });

  it("refuses when any DNS answer is private", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const { lookup } = fakeLookup({ "sneaky.example": [PUBLIC_IP, "10.0.0.5"] });
    await expect(
      fetchLinkPreview("https://sneaky.example/", { fetchImpl, lookup }),
    ).rejects.toThrow("This link points to a private network address, so it cannot be previewed.");
    expect(calls).toHaveLength(0);
  });

  it("refuses a redirect to a private host", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "https://example.com/a": () => redirect("http://metadata.attacker.example/latest"),
      "https://example.com/b": () => redirect("http://127.0.0.1/admin"),
      "https://example.com/c": () => redirect("http://[::ffff:169.254.169.254]/"),
      "https://example.com/d": () => redirect("http://localhost/"),
      "https://example.com/e": () => redirect("file:///etc/passwd"),
    });
    const { lookup } = fakeLookup({
      "example.com": [PUBLIC_IP],
      "metadata.attacker.example": ["169.254.169.254"],
    });
    for (const path of ["a", "b", "c"]) {
      await expect(
        fetchLinkPreview(`https://example.com/${path}`, { fetchImpl, lookup }),
      ).rejects.toThrow(/private network address/);
    }
    await expect(fetchLinkPreview("https://example.com/d", { fetchImpl, lookup })).rejects.toThrow(
      /local or internal/,
    );
    await expect(fetchLinkPreview("https://example.com/e", { fetchImpl, lookup })).rejects.toThrow(
      /Only http and https/,
    );
    // Each one stops after the first request, before following the redirect.
    expect(calls.map((call) => call.url)).toEqual(
      ["a", "b", "c", "d", "e"].map((path) => `https://example.com/${path}`),
    );
  });

  it("refuses a non-default port, other schemes and user names", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const { lookup, asked } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const deps = { fetchImpl, lookup };
    await expect(fetchLinkPreview("https://example.com:8443/", deps)).rejects.toThrow(
      /custom port/,
    );
    await expect(fetchLinkPreview("http://example.com:443/", deps)).rejects.toThrow(/custom port/);
    await expect(fetchLinkPreview("ftp://example.com/file", deps)).rejects.toThrow(
      /Only http and https/,
    );
    await expect(fetchLinkPreview("javascript:alert(1)", deps)).rejects.toThrow(
      /Only http and https/,
    );
    await expect(fetchLinkPreview("https://user:pass@example.com/", deps)).rejects.toThrow(
      /user name or password/,
    );
    await expect(fetchLinkPreview("not a link", deps)).rejects.toThrow(/not a valid web link/);
    expect(calls).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  it("refuses local names and private IP literals without a DNS lookup", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const { lookup, asked } = fakeLookup({});
    const deps = { fetchImpl, lookup };
    for (const url of [
      "http://localhost/",
      "http://app.localhost/",
      "http://printer.local/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://intranet/",
    ]) {
      await expect(fetchLinkPreview(url, deps)).rejects.toThrow(/local or internal/);
    }
    for (const url of [
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
    ]) {
      await expect(fetchLinkPreview(url, deps)).rejects.toThrow(/private network address/);
    }
    expect(calls).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  it("returns empty fields for a page that is not HTML", async () => {
    const { fetchImpl } = fakeFetch({
      "https://example.com/data.json": () =>
        new Response('{"og:title":"no"}', { headers: { "content-type": "application/json" } }),
    });
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const preview = await fetchLinkPreview("https://example.com/data.json", { fetchImpl, lookup });
    expect(preview).toEqual({
      url: "https://example.com/data.json",
      finalUrl: "https://example.com/data.json",
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("also parses application/xhtml+xml", async () => {
    const { fetchImpl } = fakeFetch({
      "https://example.com/x": () =>
        new Response(PAGE, { headers: { "content-type": "application/xhtml+xml" } }),
    });
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const preview = await fetchLinkPreview("https://example.com/x", { fetchImpl, lookup });
    expect(preview.title).toBe("Day 3 of 30: shipping & learning");
  });

  it("follows up to 4 redirects and refuses a 5th", async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 5; i++) {
      routes[`https://example.com/${i}`] = () => redirect(`/${i + 1}`);
    }
    routes["https://example.com/5"] = () => htmlResponse(PAGE);
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });

    const ok = fakeFetch(routes);
    const preview = await fetchLinkPreview("https://example.com/1", {
      fetchImpl: ok.fetchImpl,
      lookup,
    });
    expect(preview.finalUrl).toBe("https://example.com/5");
    expect(ok.calls).toHaveLength(5);

    const tooMany = fakeFetch(routes);
    await expect(
      fetchLinkPreview("https://example.com/0", { fetchImpl: tooMany.fetchImpl, lookup }),
    ).rejects.toThrow("The link redirects too many times.");
    expect(tooMany.calls).toHaveLength(5);
  });

  it("throws on an error status", async () => {
    const { fetchImpl } = fakeFetch({
      "https://example.com/gone": () => htmlResponse("<h1>Not found</h1>", 404),
    });
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    await expect(
      fetchLinkPreview("https://example.com/gone", { fetchImpl, lookup }),
    ).rejects.toThrow("The page answered with an error (status 404).");
  });

  it("throws plain messages for DNS and network failures", async () => {
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP], "empty.example": [] });
    const { fetchImpl } = fakeFetch({});
    await expect(
      fetchLinkPreview("https://missing.example/", { fetchImpl, lookup }),
    ).rejects.toThrow("The website for this link could not be found.");
    await expect(fetchLinkPreview("https://empty.example/", { fetchImpl, lookup })).rejects.toThrow(
      "The website for this link could not be found.",
    );
    await expect(fetchLinkPreview("https://example.com/", { fetchImpl, lookup })).rejects.toThrow(
      "The page could not be loaded.",
    );
  });

  it("times out when the server never answers", async () => {
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    // Like real fetch, this one rejects when the signal aborts.
    const honoursSignal = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("This operation was aborted", "AbortError")),
        );
      })) as typeof fetch;
    await expect(
      fetchLinkPreview("https://example.com/", { fetchImpl: honoursSignal, lookup, timeoutMs: 20 }),
    ).rejects.toThrow("The page took too long to answer.");

    // The timeout still holds when fetch ignores the signal, or when DNS hangs.
    const ignoresSignal = (() => new Promise<Response>(() => {})) as typeof fetch;
    await expect(
      fetchLinkPreview("https://example.com/", { fetchImpl: ignoresSignal, lookup, timeoutMs: 20 }),
    ).rejects.toThrow("The page took too long to answer.");
    const hangingLookup = () => new Promise<{ address: string; family: number }[]>(() => {});
    await expect(
      fetchLinkPreview("https://example.com/", {
        fetchImpl: ignoresSignal,
        lookup: hangingLookup,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("The page took too long to answer.");
  });

  it("times out while the body is still arriving", async () => {
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<head><title>Slow"));
      },
      pull() {
        return new Promise(() => {});
      },
    });
    const { fetchImpl } = fakeFetch({ "https://example.com/": () => htmlResponse(stalled) });
    await expect(
      fetchLinkPreview("https://example.com/", { fetchImpl, lookup, timeoutMs: 30 }),
    ).rejects.toThrow("The page took too long to answer.");
  });

  it("reads at most 512 KB of the body", async () => {
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const filler = new TextEncoder().encode("x".repeat(64 * 1024));
    let pulledBytes = 0;
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('<head><meta property="og:title" content="Big">'),
        );
      },
      pull(controller) {
        pulledBytes += filler.byteLength;
        controller.enqueue(filler);
      },
    });
    const { fetchImpl } = fakeFetch({ "https://example.com/": () => htmlResponse(endless) });
    const preview = await fetchLinkPreview("https://example.com/", { fetchImpl, lookup });
    expect(preview.title).toBe("Big");
    expect(pulledBytes).toBeGreaterThanOrEqual(512 * 1024 - filler.byteLength);
    expect(pulledBytes).toBeLessThanOrEqual(512 * 1024 + 2 * filler.byteLength);
  });

  it("stops reading once the head has ended", async () => {
    const { lookup } = fakeLookup({ "example.com": [PUBLIC_IP] });
    const filler = new TextEncoder().encode("<p>body text</p>".repeat(4096));
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('<head><meta property="og:title" content="Hi">'),
        );
        controller.enqueue(new TextEncoder().encode("</he"));
        controller.enqueue(new TextEncoder().encode("ad><body>"));
      },
      pull(controller) {
        pulls++;
        controller.enqueue(filler);
      },
    });
    const { fetchImpl } = fakeFetch({ "https://example.com/": () => htmlResponse(endless) });
    const preview = await fetchLinkPreview("https://example.com/", { fetchImpl, lookup });
    expect(preview.title).toBe("Hi");
    expect(pulls).toBeLessThanOrEqual(1);
  });
});
