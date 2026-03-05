/**
 * Vault management tools
 * rename_note — rename or move a file within the vault
 * delete_note — move a file to Trash/ (recoverable)
 */

import { rename, mkdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { z } from 'zod';
import { getVaultPath, findNoteByName, toRelPath } from '../utils/vault.js';

// ─── rename_note ─────────────────────────────────────────────────────────────

export const renameNoteTool = {
  name: 'rename_note',
  description: `Rename or move a note within the vault.

Source can be a filename (wikilink-style) or vault-relative path.
Target can be a new filename (stays in same folder) or a full vault-relative path (moves to new folder).

NOTE: Wikilinks in other notes that reference the old name will break — update them manually after renaming.`,
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Current filename (e.g. "My Note") or vault-relative path (e.g. "Inbox/My Note.md")',
      },
      target: {
        type: 'string',
        description: 'New filename (e.g. "Better Name.md") or vault-relative path. Bare filename keeps the same folder.',
      },
    },
    required: ['source', 'target'],
  },
};

const RenameNoteInputSchema = z.object({
  source: z.string(),
  target: z.string(),
});

async function resolveSourcePath(vaultPath: string, input: string): Promise<string | null> {
  const normalized = input.replace(/\\/g, '/');
  if (normalized.includes('/')) {
    // Explicit vault-relative path
    return join(vaultPath, normalized.endsWith('.md') ? normalized : normalized + '.md');
  }
  return findNoteByName(vaultPath, input);
}

export async function executeRenameNote(args: unknown) {
  const input = RenameNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();

  const sourcePath = await resolveSourcePath(vaultPath, input.source);
  if (!sourcePath) return { content: [{ type: 'text', text: `Not found: ${input.source}` }], isError: true };

  const targetNormalized = input.target.replace(/\\/g, '/');
  let targetPath: string;

  if (targetNormalized.includes('/')) {
    targetPath = join(vaultPath, targetNormalized.endsWith('.md') ? targetNormalized : targetNormalized + '.md');
  } else {
    const newName = input.target.endsWith('.md') ? input.target : input.target + '.md';
    targetPath = join(dirname(sourcePath), newName);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);

  const fromRel = toRelPath(vaultPath, sourcePath);
  const toRel = toRelPath(vaultPath, targetPath);

  return {
    content: [{ type: 'text', text: `Renamed: ${fromRel}\n  -> ${toRel}` }],
  };
}

// ─── delete_note ─────────────────────────────────────────────────────────────

export const deleteNoteTool = {
  name: 'delete_note',
  description: `Move a note to Trash/ (recoverable). Does not permanently delete.

Source can be a filename (wikilink-style) or vault-relative path.`,
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Filename to find anywhere in the vault (wikilink-style, e.g. "My Note")',
      },
      path: {
        type: 'string',
        description: 'Vault-relative path (e.g. "Inbox/2026-03-04 - Note - Topic.md")',
      },
    },
  },
};

const DeleteNoteInputSchema = z.object({
  file: z.string().optional(),
  path: z.string().optional(),
}).refine(d => d.file || d.path, { message: 'Either file or path must be provided' });

export async function executeDeleteNote(args: unknown) {
  const input = DeleteNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();

  const sourcePath = await resolveSourcePath(vaultPath, (input.path || input.file)!);
  if (!sourcePath) return { content: [{ type: 'text', text: `Not found: ${input.path || input.file}` }], isError: true };

  const trashPath = join(vaultPath, 'Trash', basename(sourcePath));
  await mkdir(join(vaultPath, 'Trash'), { recursive: true });
  await rename(sourcePath, trashPath);

  const fromRel = toRelPath(vaultPath, sourcePath);
  const toRel = toRelPath(vaultPath, trashPath);

  return {
    content: [{ type: 'text', text: `Trashed: ${fromRel}\n  -> ${toRel}` }],
  };
}
