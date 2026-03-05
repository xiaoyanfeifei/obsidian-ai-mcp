/**
 * Search Tools
 * Vault search functionality — reads .md files directly from the filesystem
 */

import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { z } from 'zod';
import { getVaultPath, walkVault } from '../utils/vault.js';

// Tool definition
export const vaultSearchTool = {
  name: 'vault_search',
  description: 'Search across your Obsidian vault for notes matching a query. Returns matching file paths and optionally line context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      path: {
        type: 'string',
        description: 'Optional folder path to limit search scope',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 50)',
      },
      context: {
        type: 'boolean',
        description: 'Include matching line context (default: false)',
      },
    },
    required: ['query'],
  },
};

// Input schema validation
const SearchInputSchema = z.object({
  query: z.string(),
  path: z.string().optional(),
  limit: z.number().optional(),
  context: z.boolean().optional(),
});

// Execute search
export async function executeVaultSearch(args: unknown) {
  const input = SearchInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const queryLower = input.query.toLowerCase();
  const searchRoot = input.path ? join(vaultPath, input.path) : vaultPath;
  const limit = input.limit || 50;

  const results: { file: string; line?: number; content?: string }[] = [];

  for await (const filePath of walkVault(searchRoot)) {
    if (results.length >= limit) break;

    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = filePath.slice(vaultPath.length + 1).replace(/\\/g, '/');

    if (content.toLowerCase().includes(queryLower)) {
      if (input.context) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push({ file: relPath, line: i + 1, content: lines[i].trim() });
            if (results.length >= limit) break;
          }
        }
      } else {
        results.push({ file: relPath });
      }
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
}
