export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/** Splits `text` into segments, flagging every case-insensitive occurrence of `query`. */
export function highlightMatches(text: string, query: string): HighlightSegment[] {
  if (query === "") return [{ text, matched: false }];

  const segments: HighlightSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      segments.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), matched: false });
    }
    segments.push({ text: text.slice(matchIndex, matchIndex + query.length), matched: true });
    cursor = matchIndex + query.length;
  }

  return segments.length > 0 ? segments : [{ text, matched: false }];
}
