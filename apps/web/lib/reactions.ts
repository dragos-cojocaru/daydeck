// The emoji people can react with. A short, fixed list keeps reactions readable, and the server
// refuses anything else.
export const REACTION_EMOJI = ["👍", "❤️", "🔥", "🎉", "👏", "😂", "💡", "🙌"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value);
}
