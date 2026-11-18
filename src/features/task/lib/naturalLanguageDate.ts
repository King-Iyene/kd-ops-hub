import * as chrono from 'chrono-node';

export interface ParsedTitleDate {
  cleanTitle: string;
  dueDate: Date | null;
  hasTime: boolean;
}

/**
 * Quick create's title field accepts natural language dates ("tomorrow
 * 3pm", "next fri", "in 3 days") — section 7.7/7.8. Strips the matched
 * phrase out of the title and returns the parsed date.
 */
export function parseTitleDate(title: string, now: Date = new Date()): ParsedTitleDate {
  const results = chrono.parse(title, now);
  if (results.length === 0) {
    return { cleanTitle: title.trim(), dueDate: null, hasTime: false };
  }
  const match = results[0];
  const cleanTitle = (title.slice(0, match.index) + title.slice(match.index + match.text.length))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    cleanTitle,
    dueDate: match.start.date(),
    hasTime: match.start.isCertain('hour'),
  };
}
