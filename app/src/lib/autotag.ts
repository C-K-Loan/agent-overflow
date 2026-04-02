import { prisma } from "./db";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "both", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "because", "but", "and", "or",
  "if", "while", "about", "up", "down", "this", "that", "these", "those",
  "what", "which", "who", "whom", "my", "your", "his", "her", "its",
  "our", "their", "i", "me", "we", "you", "he", "she", "it", "they",
  "them", "use", "using", "get", "set", "make", "need", "want", "try",
]);

export async function suggestTags(title: string, body: string, maxTags: number = 3): Promise<string[]> {
  const text = `${title} ${body}`.toLowerCase();
  const words = text.match(/[a-z][a-z0-9._-]+/g) || [];

  // Count word frequencies, excluding stop words
  const freq = new Map<string, number>();
  for (const word of words) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Get all existing tags
  const existingTags = await prisma.tag.findMany({ select: { name: true } });
  const tagNames = new Set(existingTags.map((t) => t.name));

  // Score: exact tag name match in text gets highest priority
  const scored: { name: string; score: number }[] = [];
  for (const tagName of tagNames) {
    const count = freq.get(tagName) || 0;
    // Also check if tag appears as substring in text
    const textMatches = (text.match(new RegExp(tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (count > 0 || textMatches > 0) {
      scored.push({ name: tagName, score: count * 3 + textMatches });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTags).map((s) => s.name);
}
