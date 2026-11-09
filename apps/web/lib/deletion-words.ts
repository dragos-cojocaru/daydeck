/** How far away a deletion is, in words: "today", "tomorrow" or "in 12 days". */
export function deletionPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
