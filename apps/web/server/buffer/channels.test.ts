import type { BufferChannel } from "@daydeck/buffer";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_URL, connect, createUser, FakeTokenServer, setupDeps } from "@/test/buffer-fakes";
import { listChannels, setSelectedChannels, syncChannels } from "./channels";
import type { BufferDeps } from "./deps";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let userId: string;
let remote: BufferChannel[];
let requestedOrg: string | undefined;

function channel(id: string, overrides: Partial<BufferChannel> = {}): BufferChannel {
  return {
    id,
    organizationId: "org-1",
    service: "linkedin",
    name: `name-${id}`,
    displayName: null,
    avatar: `https://example.com/${id}.png`,
    timezone: "Europe/Bucharest",
    isDisconnected: false,
    isQueuePaused: false,
    isLocked: false,
    postingSchedule: [{ day: "mon", paused: false, times: ["09:00"] }],
    ...overrides,
  };
}

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  const fake = new FakeTokenServer();
  userId = (await createUser(deps)).id;
  await connect(deps, userId, fake.issue(), 60 * 60 * 1000);
  remote = [];
  server.use(
    fake.handler(),
    http.post(API_URL, async ({ request }) => {
      const body = (await request.json()) as { variables: { organizationId: string } };
      requestedOrg = body.variables.organizationId;
      return HttpResponse.json({ data: { channels: remote } });
    }),
  );
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

const ids = (rows: { bufferChannelId: string }[]) => rows.map((r) => r.bufferChannelId);
const selectedIds = (rows: { bufferChannelId: string; selected: boolean }[]) =>
  rows.filter((r) => r.selected).map((r) => r.bufferChannelId);

describe("syncChannels", () => {
  it("asks for the connection's organization and caches every channel", async () => {
    remote = [channel("a"), channel("b", { isQueuePaused: true })];
    const rows = await syncChannels(deps, userId);
    expect(requestedOrg).toBe("org-1");
    expect(ids(rows)).toEqual(["a", "b"]);
    expect(rows[1]?.isQueuePaused).toBe(true);
    expect(rows[0]?.postingSchedule).toEqual([{ day: "mon", paused: false, times: ["09:00"] }]);
  });

  it("picks the only usable channel on the first sync", async () => {
    remote = [channel("a"), channel("b", { isDisconnected: true })];
    expect(selectedIds(await syncChannels(deps, userId))).toEqual(["a"]);
  });

  it("picks nothing when there is a real choice to make", async () => {
    remote = [channel("a"), channel("b")];
    expect(selectedIds(await syncChannels(deps, userId))).toEqual([]);
  });

  it("keeps the user's choice, updates details and drops channels that left Buffer", async () => {
    remote = [channel("a"), channel("b"), channel("c")];
    const first = await syncChannels(deps, userId);
    const b = first.find((r) => r.bufferChannelId === "b");
    await setSelectedChannels(deps, userId, [b?.id ?? ""]);

    remote = [channel("b", { name: "renamed", isDisconnected: true }), channel("c")];
    const rows = await syncChannels(deps, userId);
    // Sorted by name: "name-c" comes before "renamed".
    expect(rows.map((r) => [r.bufferChannelId, r.name, r.selected, r.isDisconnected])).toEqual([
      ["c", "name-c", false, false],
      ["b", "renamed", true, true],
    ]);
  });

  it("empties the cache when the organization has no channels left", async () => {
    remote = [channel("a")];
    await syncChannels(deps, userId);
    remote = [];
    expect(await syncChannels(deps, userId)).toEqual([]);
  });
});

describe("setSelectedChannels", () => {
  it("selects only the user's own usable channels", async () => {
    remote = [channel("a"), channel("b", { isLocked: true }), channel("c")];
    const rows = await syncChannels(deps, userId);
    const idOf = (id: string) => rows.find((r) => r.bufferChannelId === id)?.id ?? "";

    const count = await setSelectedChannels(deps, userId, [
      idOf("a"),
      idOf("b"),
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(count).toBe(1);
    expect(selectedIds(await listChannels(deps, userId))).toEqual(["a"]);

    await setSelectedChannels(deps, userId, []);
    expect(selectedIds(await listChannels(deps, userId))).toEqual([]);
  });
});
