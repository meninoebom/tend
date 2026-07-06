import type { BucketType, Domain, TaskSize } from "./api-types";

export interface ParsedCapture {
  text: string;
  domainId?: string;
  important: boolean;
  urgent: boolean;
  bucket?: BucketType;
  size?: TaskSize;
}

const BUCKET_WORDS: Record<string, BucketType> = {
  today: "today",
  soon: "soon",
  later: "later",
  someday: "someday",
};

const SIZE_LETTERS: Record<string, TaskSize> = { s: "s", m: "m", l: "l" };

/**
 * Parse inline capture tokens out of a task string. The grammar lets capture be
 * fast with *optional* classification (Tend's real sorting moment is triage):
 *
 *   #health         domain, prefix-matched against the user's domain names
 *   !               important
 *   !!              important + urgent
 *   u!              urgent
 *   >soon|later|someday|today   bucket
 *   ~s|~m|~l        size (S/M/L)
 *
 * Recognized tokens are stripped from the returned text. Unrecognized tokens
 * (e.g. a `#tag` that matches no domain) are left in the text verbatim.
 */
export function parseCapture(raw: string, domains: Domain[]): ParsedCapture {
  const result: ParsedCapture = { text: "", important: false, urgent: false };
  const kept: string[] = [];

  for (const token of raw.split(/\s+/)) {
    if (token === "") continue;
    const lower = token.toLowerCase();

    // Priority
    if (token === "!") {
      result.important = true;
      continue;
    }
    if (token === "!!") {
      result.important = true;
      result.urgent = true;
      continue;
    }
    if (token === "u!" || token === "!u") {
      result.urgent = true;
      continue;
    }

    // Bucket: >later
    if (token.startsWith(">")) {
      const bucket = BUCKET_WORDS[lower.slice(1)];
      if (bucket) {
        result.bucket = bucket;
        continue;
      }
    }

    // Size: ~m
    if (token.startsWith("~") && token.length === 2) {
      const size = SIZE_LETTERS[lower.slice(1)];
      if (size) {
        result.size = size;
        continue;
      }
    }

    // Domain: #health (prefix match, first wins). Only bind once.
    if (token.startsWith("#") && token.length > 1 && result.domainId === undefined) {
      const query = lower.slice(1);
      const match = domains.find((d) => d.name.toLowerCase().startsWith(query));
      if (match) {
        result.domainId = match.id;
        continue;
      }
    }

    kept.push(token);
  }

  result.text = kept.join(" ").trim();
  return result;
}
