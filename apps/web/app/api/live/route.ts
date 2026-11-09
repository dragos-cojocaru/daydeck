import { getCurrentSession } from "@/server/auth/current-user";
import { liveSnapshot, liveStamp } from "@/server/community/live";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

// Live updates as Server-Sent Events: one stream per open tab. Every second it asks one small
// question ("did anything change?") and sends the new picture only when the answer changes.
// It ends before the platform's time limit; the browser reconnects on its own.
const TICK_MS = 1_000;
const PING_EVERY = 15;
const STREAM_MS = 240_000;

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const userId = session.user.id;
  const db = getDb();
  if (await limitUser(db, "liveStream", userId)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const close = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", close);
      const send = (text: string) => {
        if (open) controller.enqueue(encoder.encode(text));
      };
      // Reconnect after one second when the stream ends.
      send("retry: 1000\n\n");
      const started = Date.now();
      let last = "";
      for (let tick = 0; open && Date.now() - started < STREAM_MS; tick++) {
        try {
          const stamp = await liveStamp(db, userId);
          if (stamp !== last) {
            last = stamp;
            send(`data: ${JSON.stringify(await liveSnapshot(db, userId))}\n\n`);
          } else if (tick % PING_EVERY === 0) {
            // A comment line keeps proxies from closing a quiet connection.
            send(": ping\n\n");
          }
        } catch {
          // A database hiccup: try again on the next tick.
        }
        await new Promise((resolve) => setTimeout(resolve, TICK_MS));
      }
      close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
