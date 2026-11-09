import type { NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/current-user";
import { boardCursor, loadBoard } from "@/server/board/board";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

// The live board polls this every 20 seconds while its tab is visible. With an unchanged
// cursor the answer is "204 No Content", so an idle board costs one small query.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/board/[slug]">) {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const { slug } = await params;
  const db = getDb();
  const now = new Date();
  if (await limitUser(db, "board", session.user.id)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }
  const cursor = await boardCursor(db, slug, session.user.id, now);
  if (!cursor) return new Response(null, { status: 404 });
  if (request.nextUrl.searchParams.get("cursor") === cursor) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const board = await loadBoard(db, slug, session.user.id, now);
  if (!board) return new Response(null, { status: 404 });
  return Response.json(board, { headers: { "Cache-Control": "no-store" } });
}
