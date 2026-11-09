import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoardSkeleton } from "@/components/skeletons";
import { TermHint } from "@/components/term-hint";
import { BoardLegend } from "@/features/board/board-legend";
import { BoardViews } from "@/features/board/board-views";
import { requireUser } from "@/server/auth/current-user";
import { loadBoard } from "@/server/board/board";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage({ params }: PageProps<"/challenges/[slug]/board">) {
  return (
    <main
      id="main"
      className="flex w-full flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
    >
      {/* Fixed text, so it is part of the first paint; the rest streams in below it. */}
      <h1 className="-mb-4 font-semibold text-3xl tracking-tight">Board</h1>
      <Suspense fallback={<BoardSkeleton />}>
        <Board params={params} />
      </Suspense>
    </main>
  );
}

async function Board({ params }: Pick<PageProps<"/challenges/[slug]/board">, "params">) {
  const { slug } = await params;
  const user = await requireUser(`/challenges/${slug}/board`);
  const board = await loadBoard(getDb(), slug, user.id, new Date());
  if (!board) notFound();
  const people = board.rows.length;

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="max-w-3xl text-muted-foreground">
          Each day of this challenge has one{" "}
          <TermHint hint="A short idea for what to post that day.">prompt</TermHint>. The board
          shows every day for{" "}
          {people === 1 ? "you (nobody else has joined yet)" : `all ${people} people`}: whether that
          day's post is saved, scheduled or published in Buffer. A day turns green once its post is
          published, and this page updates on its own while it is open.
        </p>
      </div>
      <BoardViews slug={slug} initial={board} />
      <BoardLegend />
    </>
  );
}
