#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  gmailSearch,
  gmailGetMessage,
  gmailListUnread,
  GmailAccountNotConfiguredError,
} from "./gmail-client.js";
import { listAccounts } from "./token-store.js";

const server = new McpServer({
  name: "mea-gmail",
  version: "0.1.0",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResponse(e: unknown): { content: [{ type: "text"; text: string }] } {
  let msg: string;
  if (e instanceof GmailAccountNotConfiguredError) {
    msg = e.message;
  } else if (e instanceof Error) {
    msg = e.message;
  } else {
    msg = String(e);
  }
  return { content: [{ type: "text", text: `Error: ${msg}` }] };
}

// ─── Tool: gmail_list_accounts ───────────────────────────────────────────────

server.registerTool(
  "gmail_list_accounts",
  {
    description:
      "Returns the list of Gmail accounts that have been authenticated with MEA. " +
      "Returns an empty list if no accounts have been set up (connector mode or MCP not yet configured). " +
      "Use this to confirm which accounts are available before calling gmail_search.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async () => {
    const accounts = listAccounts();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ accounts }, null, 2),
        },
      ],
      structuredContent: { accounts },
    };
  }
);

// ─── Tool: gmail_search ──────────────────────────────────────────────────────

server.registerTool(
  "gmail_search",
  {
    description:
      "Search Gmail for a specific account using Gmail search syntax. " +
      'Example queries: "after:2026/01/01 is:unread", "from:boss@example.com", "subject:invoice". ' +
      "Returns subject, sender, date, snippet, messageId, and attachment info. " +
      "Use gmail_list_accounts first to confirm available accounts.",
    inputSchema: {
      account: z
        .string()
        .email()
        .describe("Gmail address to search, e.g. melissa@queenofcode.dev"),
      query: z
        .string()
        .describe(
          'Gmail search query, e.g. "after:2026/03/01 is:unread" or "from:school.com"'
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Maximum number of results to return (default 50, max 100)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ account, query, maxResults }) => {
    try {
      const results = await gmailSearch(account, query, maxResults);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
        structuredContent: { results, count: results.length, account, query },
      };
    } catch (e) {
      return errorResponse(e);
    }
  }
);

// ─── Tool: gmail_get_message ─────────────────────────────────────────────────

server.registerTool(
  "gmail_get_message",
  {
    description:
      "Fetch full headers and snippet for a specific Gmail message by ID. " +
      "Returns subject, from, to, cc, date, snippet, labelIds, hasAttachments. " +
      "Email body is never fetched or stored — only metadata and a short snippet.",
    inputSchema: {
      account: z
        .string()
        .email()
        .describe("Gmail address the message belongs to"),
      messageId: z.string().describe("The Gmail message ID from gmail_search results"),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ account, messageId }) => {
    try {
      const detail = await gmailGetMessage(account, messageId);
      return {
        content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
        structuredContent: detail as unknown as Record<string, unknown>,
      };
    } catch (e) {
      return errorResponse(e);
    }
  }
);

// ─── Tool: gmail_list_unread ─────────────────────────────────────────────────

server.registerTool(
  "gmail_list_unread",
  {
    description:
      'Shorthand for gmail_search with query "is:unread". ' +
      "Returns unread messages for the given account. " +
      "Useful for the daily briefing or a quick inbox check.",
    inputSchema: {
      account: z
        .string()
        .email()
        .describe("Gmail address to check for unread messages"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Maximum number of results to return (default 50, max 100)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ account, maxResults }) => {
    try {
      const results = await gmailListUnread(account, maxResults);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        structuredContent: { results, count: results.length, account },
      };
    } catch (e) {
      return errorResponse(e);
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Intentionally no console.log — stdio is the MCP channel, any output corrupts it.
  // Errors go to stderr which Claude Code captures separately.
}

main().catch((e) => {
  process.stderr.write(`Fatal error starting mea-gmail MCP server: ${e}\n`);
  process.exit(1);
});
