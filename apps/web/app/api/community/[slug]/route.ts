import type { NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/current-user";
import { type Channel, listMessages, memberOf } from "@/server/community/service";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

const CHANNELS: Channel[] = ["updates", "chat", "posts"];

// An open channel asks this every few seconds while its tab is visible. With an unchanged
// version the answer is "204 No Content", so a quiet channel costs one small query.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/community/[slug]">) {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const { slug } = await params;
  const channel = request.nextUrl.searchParams.get("channel") as Channel;
  if (!CHANNELS.includes(channel)) return new Response(null, { status: 400 });
  const db = getDb();
  if (await limitUser(db, "live", session.user.id)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }
  const member = await memberOf(db, slug, session.user.id);
  if (!member) return new Response(null, { status: 404 });
  const version = String(member.challenge.communityVersion);
  if (request.nextUrl.searchParams.get("v") === version) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const messages = await listMessages(db, member, channel, new Date());
  return Response.json(
    {
      version: member.challenge.communityVersion,
      chatEnabled: member.challenge.chatEnabled,
      messages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
