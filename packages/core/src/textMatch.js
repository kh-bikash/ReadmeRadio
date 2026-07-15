/**
 * Shared text normalization used by both diagram node cue-matching
 * (deriveNodeCueTimes) and beat-to-word alignment (alignBeatsToWords) —
 * one definition of "what counts as a token" for all narration matching.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}
