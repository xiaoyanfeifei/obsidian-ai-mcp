/**
 * File Tools
 * Read vault files directly from the filesystem
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { getVaultPath, findNoteByName } from '../utils/vault.js';

// Tool definition
export const readNoteTool = {
  name: 'read_note',
  description: 'Read the content of a note in the vault. Provide either file name (resolves like wikilink) or exact path.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Note filename (resolves like wikilink, e.g., "React Concepts")',
      },
      path: {
        type: 'string',
        description: 'Exact path from vault root (e.g., "Tech/React Concepts.md")',
      },
    },
  },
};

// Input schema validation
const ReadNoteInputSchema = z.object({
  file: z.string().optional(),
  path: z.string().optional(),
}).refine(data => data.file || data.path, {
  message: 'Either file or path must be provided',
});

// Execute read
export async function executeReadNote(args: unknown) {
  const input = ReadNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();

  let filePath: string | null = null;

  if (input.path) {
    filePath = join(vaultPath, input.path);
  } else if (input.file) {
    filePath = await findNoteByName(vaultPath, input.file);
    if (!filePath) return { content: [{ type: 'text', text: `Note not found: ${input.file}` }], isError: true };
  }

  const content = await readFile(filePath!, 'utf-8');

  return {
    content: [{ type: 'text', text: content }],
  };
}
