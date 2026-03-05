/**
 * Promote Tool
 * Moves a reviewed Inbox draft to a permanent note outside Inbox.
 *
 * WORKFLOW:
 *   1. Claude reads the Inbox draft with read_note
 *   2. Claude summarizes and presents to user for approval
 *   3. User approves (or edits)
 *   4. Claude calls promote_note with the approved summary
 *   5. Summary is appended to permanent note; Inbox draft is deleted
 *
 * Permanent notes are NEVER overwritten — only appended to.
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { z } from 'zod';
import matter from 'gray-matter';
import { getVaultPath } from '../utils/vault.js';
import { parseInboxFilename, injectFrontmatter, appendToContent, parseFrontmatter } from '../utils/frontmatter.js';

export const promoteNoteTool = {
  name: 'promote_note',
  description: `Promote an approved Inbox draft to a permanent note outside Inbox.

IMPORTANT: Always read the Inbox draft first, summarize it, and get user approval BEFORE calling this tool. Never call this without user confirmation of what will be written.

The permanent note is append-only — existing content is never modified. Frontmatter (status, updated, changes) is updated automatically. The Inbox draft is deleted after promotion by default.`,
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Inbox file path, e.g. "Inbox/2026-03-03 - Devlog - Content Streaming.md"',
      },
      target: {
        type: 'string',
        description: 'Permanent destination path outside Inbox, e.g. "Notes/Content Streaming Animation.md" or "Notes/Auth Strategy.md". Created if it does not exist.',
      },
      summary: {
        type: 'string',
        description: 'The user-approved content to append to the permanent note.',
      },
      change_note: {
        type: 'string',
        description: 'Brief description for the changes log, e.g. "Promoted from 2026-03-03 daily devlog".',
      },
      delete_source: {
        type: 'boolean',
        description: 'Delete the Inbox draft after promoting (default: true).',
      },
    },
    required: ['source', 'target', 'summary'],
  },
};

const PromoteNoteInputSchema = z.object({
  source: z.string(),
  target: z.string(),
  summary: z.string(),
  change_note: z.string().optional(),
  delete_source: z.boolean().optional(),
});

export async function executePromoteNote(args: unknown) {
  const input = PromoteNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const deleteSource = input.delete_source !== false; // default true

  const sourcePath = join(vaultPath, input.source);
  const targetPath = join(vaultPath, input.target);

  // Read source to extract metadata for the change note
  let sourceMeta: Record<string, unknown> = {};
  try {
    sourceMeta = parseFrontmatter(await readFile(sourcePath, 'utf-8'));
  } catch {
    throw new Error(`Source not found: ${input.source}`);
  }

  const changeNote = input.change_note || `Promoted from ${basename(input.source)}`;

  // Read existing target or initialise a new one
  let targetContent = '';
  try {
    targetContent = await readFile(targetPath, 'utf-8');
  } catch {
    // Target doesn't exist — create with frontmatter inherited from source
    const fromFilename = parseInboxFilename(basename(input.target));
    targetContent = injectFrontmatter('', {
      type: (sourceMeta.type as string) || fromFilename.type || 'note',
      topic: (sourceMeta.topic as string) || fromFilename.topic || basename(input.target, '.md'),
      status: 'active',
    });
  }

  // Append summary; status → active if it was still draft
  let updated = appendToContent(targetContent, input.summary, changeNote);
  const parsed = matter(updated);
  if (parsed.data.status === 'draft') {
    parsed.data.status = 'active';
    updated = matter.stringify(parsed.content, parsed.data);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, updated, 'utf-8');

  if (deleteSource) {
    try { await unlink(sourcePath); } catch { /* ignore */ }
  }

  const lines = [
    `Promoted: ${input.target}`,
    ...(deleteSource ? [`  Deleted: ${input.source}`] : []),
  ];
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}
