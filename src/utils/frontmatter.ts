/**
 * Frontmatter utilities
 * Shared helpers for reading and updating YAML frontmatter in vault notes
 */

import matter from 'gray-matter';
import { basename } from 'path';

// Timezone for all timestamps.
// Defaults to the local system timezone (from the machine running the server).
// Codespace runs UTC but the server runs locally, so this is always correct.
// Override with MCP_TIMEZONE env var if needed.
const TIMEZONE = process.env.MCP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Returns today's date as YYYY-MM-DD in the configured timezone */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Returns current time as HH:MM in the configured timezone */
export function currentTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

/** Parse type and topic from Inbox naming convention: "YYYY-MM-DD - Type - Topic.md" */
export function parseInboxFilename(filename: string): { type?: string; topic?: string } {
  const match = basename(filename).match(/^\d{4}-\d{2}-\d{2} - (.+?) - (.+)\.md$/i);
  if (match) return { type: match[1].toLowerCase(), topic: match[2] };
  return {};
}

/** Inject frontmatter at the top of content that doesn't already have it */
export function injectFrontmatter(
  content: string,
  opts: { type?: string; topic?: string; status?: string },
): string {
  if (content.trimStart().startsWith('---')) return content;

  const d = today();
  const data: Record<string, unknown> = {
    type: opts.type || 'note',
    ...(opts.topic ? { topic: opts.topic } : {}),
    status: opts.status || 'draft',
    created: d,
    updated: d,
    changes: [`${d}: Created`],
  };

  return matter.stringify('\n' + content, data);
}

/**
 * Append text to a note's body, updating its frontmatter change log.
 * If the file has no frontmatter, content is simply appended.
 */
export function appendToContent(
  fileContent: string,
  appendText: string,
  changeNote: string,
  skipChangeLog = false,
): string {
  if (!fileContent.trimStart().startsWith('---')) {
    const sep = fileContent && !fileContent.endsWith('\n') ? '\n' : '';
    return fileContent + sep + appendText;
  }

  const parsed = matter(fileContent);
  const d = today();
  parsed.data.updated = d;
  if (!skipChangeLog) {
    if (!Array.isArray(parsed.data.changes)) parsed.data.changes = [];
    parsed.data.changes = [...parsed.data.changes, `${d}: ${changeNote}`];
  }

  const sep = parsed.content && !parsed.content.endsWith('\n') ? '\n' : '';
  return matter.stringify(parsed.content + sep + appendText, parsed.data);
}

/**
 * Prepend text into a note's body, inserting after the first --- divider in the body
 * (used as a section separator in Capture.md). Falls back to inserting at body start
 * if no divider is found. Updates frontmatter change log.
 */
export function prependToContent(
  fileContent: string,
  newText: string,
  changeNote: string,
  skipChangeLog = false,
): string {
  if (!fileContent.trimStart().startsWith('---')) {
    return newText + '\n\n' + fileContent;
  }

  const parsed = matter(fileContent);
  const d = today();
  parsed.data.updated = d;
  if (!skipChangeLog) {
    if (!Array.isArray(parsed.data.changes)) parsed.data.changes = [];
    parsed.data.changes = [...parsed.data.changes, `${d}: ${changeNote}`];
  }

  const body = parsed.content;
  const dividerIdx = body.indexOf('\n---\n');

  let newBody: string;
  if (dividerIdx !== -1) {
    const before = body.slice(0, dividerIdx + 5); // up to and including "\n---\n"
    const after = body.slice(dividerIdx + 5);
    newBody = before + '\n' + newText + (after.trim() ? '\n\n' + after.trimStart() : '\n');
  } else {
    newBody = '\n' + newText + '\n' + body;
  }

  return matter.stringify(newBody, parsed.data);
}

/** Read the parsed frontmatter data from a file string, or {} if none */
export function parseFrontmatter(fileContent: string): Record<string, unknown> {
  if (!fileContent.trimStart().startsWith('---')) return {};
  return matter(fileContent).data as Record<string, unknown>;
}
