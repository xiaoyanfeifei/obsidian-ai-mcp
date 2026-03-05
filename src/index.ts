#!/usr/bin/env node

/**
 * Obsidian AI Assistant MCP Server
 * Entry point for the MCP server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidTokenError, InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getVaultPath } from './utils/vault.js';

// Read vault_context.md once at startup and cache it.
// Passed as MCP `instructions` — sent once at session handshake, not on every tool call.
let _vaultContext: string | null | undefined = undefined;
async function getVaultContext(): Promise<string | null> {
  if (_vaultContext !== undefined) return _vaultContext;
  try {
    _vaultContext = await readFile(join(getVaultPath(), 'vault_context.md'), 'utf-8');
  } catch {
    _vaultContext = null;
  }
  return _vaultContext;
}
import { vaultSearchTool, executeVaultSearch } from './tools/search.js';
import { readNoteTool, executeReadNote } from './tools/files.js';
import { listTasksTool, executeListTasks, completeTaskTool, executeCompleteTask } from './tools/tasks.js';
import { writeNoteTool, appendToNoteTool, listNotesTool, listInboxTool, vaultSummaryTool, vaultReviewTool, executeWriteNote, executeAppendToNote, executeListNotes, executeListInbox, executeVaultSummary, executeVaultReview } from './tools/write.js';
import { promoteNoteTool, executePromoteNote } from './tools/promote.js';
import { createNoteTool, executeCreateNote } from './tools/create.js';
import { renameNoteTool, executeRenameNote, deleteNoteTool, executeDeleteNote } from './tools/manage.js';

// Factory: create a fresh Server instance with all handlers registered.
// Called per-request in HTTP mode so each MCP session starts with clean state.
function createMcpServer(instructions?: string): Server {
  const s = new Server(
    { name: 'obsidian-ai-mcp', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions }
  );

  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [vaultSearchTool, readNoteTool, listTasksTool, completeTaskTool, listNotesTool, listInboxTool, vaultSummaryTool, vaultReviewTool, createNoteTool, writeNoteTool, appendToNoteTool, promoteNoteTool, renameNoteTool, deleteNoteTool],
  }));

  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'vault_search':   return await executeVaultSearch(args);
        case 'read_note':      return await executeReadNote(args);
        case 'list_tasks':     return await executeListTasks(args);
        case 'complete_task':  return await executeCompleteTask(args);
        case 'vault_summary':  return await executeVaultSummary(args);
        case 'vault_review':   return await executeVaultReview(args);
        case 'create_note':    return await executeCreateNote(args);
        case 'list_notes':     return await executeListNotes(args);
        case 'list_inbox':     return await executeListInbox(args);
        case 'write_note':     return await executeWriteNote(args);
        case 'append_to_note': return await executeAppendToNote(args);
        case 'promote_note':   return await executePromoteNote(args);
        case 'rename_note':    return await executeRenameNote(args);
        case 'delete_note':    return await executeDeleteNote(args);
        default: throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `Error executing ${name}: ${errorMessage}` }], isError: true };
    }
  });

  return s;
}

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await createMcpServer(await getVaultContext() ?? undefined).connect(transport);
  console.error('Obsidian AI MCP Server started (stdio)');
  console.error('Vault path:', process.env.OBSIDIAN_VAULT || 'Not configured');
}

// Minimal OAuth provider: auto-approves all clients, issues a static token.
// Claude Code requires OAuth for HTTP MCP; this lets it complete the flow
// automatically so subsequent connections work without user interaction.
class SimpleTokenProvider implements OAuthServerProvider {
  readonly skipLocalPkceValidation = true;
  private readonly _clients = new Map<string, OAuthClientInformationFull>();
  private readonly _pendingCodes = new Map<string, string>(); // code → clientId

  constructor(private readonly _token: string) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => this._clients.get(clientId),
      registerClient: async (client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>) => {
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        this._clients.set(full.client_id, full);
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const code = randomUUID();
    this._pendingCodes.set(code, client.client_id);
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state) redirect.searchParams.set('state', params.state);
    res.redirect(redirect.toString());
  }

  async challengeForAuthorizationCode(): Promise<string> {
    return ''; // skipLocalPkceValidation = true, so this is never checked
  }

  async exchangeAuthorizationCode(_client: OAuthClientInformationFull, code: string): Promise<OAuthTokens> {
    if (!this._pendingCodes.delete(code)) throw new InvalidGrantError('Invalid or expired authorization code');
    return { access_token: this._token, token_type: 'bearer', expires_in: 86400 * 365 };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    return { access_token: this._token, token_type: 'bearer', expires_in: 86400 * 365 };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token !== this._token) throw new InvalidTokenError('Invalid token');
    return {
      token,
      clientId: 'obsidian-mcp-client',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year
    };
  }
}

async function startHttp(port: number, authToken: string, baseUrl: string): Promise<void> {
  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.set('trust proxy', 1); // Required for express-rate-limit when behind Cloudflare tunnel
  const issuerUrl = new URL(baseUrl);
  const provider = new SimpleTokenProvider(authToken);

  // OAuth endpoints: /.well-known/*, /authorize, /token, /register
  app.use(mcpAuthRouter({ provider, issuerUrl, resourceName: 'Obsidian AI MCP' }));

  // Health check — no auth required
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', server: 'obsidian-ai-mcp' });
  });

  // Setup script — curl this from Codespace to auto-configure MCP, no auth required
  app.get('/setup.sh', (_req: Request, res: Response) => {
    res.type('text/plain');
    res.send([
      '#!/bin/bash',
      'set -e',
      'echo "Configuring Obsidian AI MCP..."',
      `claude mcp remove obsidian 2>/dev/null || true`,
      `claude mcp add --transport http obsidian ${baseUrl}/mcp`,
      'echo ""',
      'echo "✓ Done. Start a new Claude session and the obsidian tools will be available."',
    ].join('\n') + '\n');
  });

  // MCP endpoint — fresh server+transport per request (stateless mode requires clean state)
  app.all('/mcp',
    requireBearerAuth({ verifier: provider }),
    async (req: Request, res: Response) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await createMcpServer(await getVaultContext() ?? undefined).connect(transport);
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('MCP handleRequest error:', err);
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    }
  );

  // Catch any unhandled Express errors
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Express unhandled error:', err);
    res.status(500).json({ error: String(err) });
  });

  await new Promise<void>((resolve, reject) => {
    app.listen(port, '0.0.0.0', () => {
      console.error(`Obsidian AI MCP Server started (HTTP) on port ${port}`);
      console.error('Vault path:', process.env.OBSIDIAN_VAULT || 'Not configured');
      console.error(`Base URL: ${baseUrl}`);
      resolve();
    }).on('error', reject);
  });
}

async function main(): Promise<void> {
  const httpPortRaw = process.env.MCP_HTTP_PORT;
  if (httpPortRaw) {
    const port = parseInt(httpPortRaw, 10);
    if (isNaN(port)) { console.error('Invalid MCP_HTTP_PORT'); process.exit(1); }
    const authToken = process.env.MCP_AUTH_TOKEN;
    if (!authToken) { console.error('MCP_AUTH_TOKEN is required in HTTP mode'); process.exit(1); }
    const baseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;
    await startHttp(port, authToken, baseUrl);
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
