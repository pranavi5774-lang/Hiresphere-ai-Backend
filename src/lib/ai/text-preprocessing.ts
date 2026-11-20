// ============================================================
// HireSphere AI — NLP Text Preprocessing
// ============================================================
// Transparent, deterministic preprocessing used before TF-IDF
// vectorization. Deliberately simple and explainable so that HR
// users and reviewers can understand every transformation.
// ============================================================

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'his', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'me', 'my', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'us', 'was', 'we',
  'were', 'what', 'when', 'which', 'who', 'will', 'with', 'would', 'you', 'your', 'also', 'via',
  'per', 'using', 'used', 'use', 'etc', 'about', 'over', 'under', 'all', 'any', 'each', 'may',
  'able', 'across', 'along', 'both', 'within',
]);

/**
 * Very small, transparent suffix stripper (not a full Porter stemmer).
 * Handles common plural/gerund forms without over-stemming technical
 * terms. Unknown words pass through unchanged — no surprises.
 */
export function lightStem(word: string): string {
  if (word.length <= 3) return word;
  if (/[.+#]/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ers') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Normalize raw text: unify line endings, strip bullets/control chars, collapse whitespace. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/^[\s]*[•▪◦*\-–—·]+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Tokenize normalized text into preprocessed terms.
 * Preserves in-word technical symbols (c++, c#, node.js, asp.net).
 */
export function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((t) => t.length >= 2 && t.length <= 30 && !STOPWORDS.has(t) && /[a-z0-9]/.test(t))
    .map(lightStem);
  return tokens;
}

/** Split text into sentence-ish segments (used to show resume evidence snippets). */
export function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

/** Extract a named section (e.g. "Education", "Experience") from resume text. */
export function extractSection(text: string, headings: string[]): string | null {
  const lines = text.split('\n');
  const headingRe = new RegExp(`^\\s*(?:${headings.map(escapeRe).join('|')})\\s*:?\\s*$`, 'i');
  let collecting: string[] | null = null;
  for (const line of lines) {
    if (headingRe.test(line)) {
      collecting = [];
      continue;
    }
    if (collecting) {
      // next ALL-CAPS or heading-like line ends the section
      if (/^\s*[A-Z][A-Z \-&/]{4,}\s*$/.test(line) && line.trim().length > 3) {
        break;
      }
      collecting.push(line.trim());
    }
  }
  const result = collecting?.filter(Boolean).join('\n').trim();
  return result && result.length > 0 ? result : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
