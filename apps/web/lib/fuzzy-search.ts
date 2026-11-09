// A small, forgiving search for short lists such as Buffer's template library. Every word of
// the query must match a word of the item: the start of it, any part of it, or the same word
// with a small typo. Accents and letter case are ignored. Better matches come first.

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized ? normalized.split(" ") : [];
}

/** Edit distance with swaps of two neighbouring letters (Damerau-Levenshtein, restricted). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const above = d[i - 1] as number[];
      row[j] = Math.min(
        (above[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (above[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** How many typos a query word may have: none for short words, then one, then two. */
function allowedTypos(word: string): number {
  if (word.length < 4) return 0;
  return word.length < 8 ? 1 : 2;
}

/** Scores one query word against one item word: 3 start, 2 inside, 1 typo, 0 no match. */
function wordScore(query: string, word: string): number {
  if (word.startsWith(query)) return 3;
  if (word.includes(query)) return 2;
  const typos = allowedTypos(query);
  if (typos === 0) return 0;
  // Compare with the start of the word too, so a half-typed word with a typo still matches.
  const head = word.slice(0, query.length);
  return Math.min(editDistance(query, word), editDistance(query, head)) <= typos ? 1 : 0;
}

/**
 * The items that match every word of `query`, best first. `fields` gives each item's
 * searchable text, most important first: a match in the first field counts double.
 */
export function fuzzySearch<T>(items: T[], query: string, fields: (item: T) => string[]): T[] {
  const queryWords = words(query);
  if (queryWords.length === 0) return items;

  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const fieldWords = fields(item).map(words);
    let total = 0;
    for (const queryWord of queryWords) {
      let best = 0;
      fieldWords.forEach((list, fieldIndex) => {
        const weight = fieldIndex === 0 ? 2 : 1;
        for (const word of list) best = Math.max(best, wordScore(queryWord, word) * weight);
      });
      if (best === 0) return;
      total += best;
    }
    scored.push({ item, score: total, index });
  });
  // Higher score first; equal scores keep the list's own order.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.item);
}
