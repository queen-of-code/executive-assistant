import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { loadOAuthClient, loadToken, saveToken, StoredToken } from "./token-store.js";

export interface EmailSummary {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labelIds: string[];
  hasAttachments: boolean;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  cc: string;
}

function makeOAuth2Client(account: string): OAuth2Client {
  const creds = loadOAuthClient();
  const client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    "http://localhost:9876/oauth2callback"
  );

  const token = loadToken(account);
  if (!token) {
    throw new GmailAccountNotConfiguredError(account);
  }
  client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expiry_date,
    token_type: token.token_type,
  });

  // Persist refreshed tokens automatically
  client.on("tokens", (newTokens) => {
    const merged: StoredToken = {
      access_token: newTokens.access_token ?? token.access_token,
      refresh_token: newTokens.refresh_token ?? token.refresh_token,
      expiry_date: newTokens.expiry_date ?? token.expiry_date,
      token_type: newTokens.token_type ?? token.token_type,
      scope: newTokens.scope ?? token.scope,
    };
    saveToken(account, merged);
  });

  return client;
}

export class GmailAccountNotConfiguredError extends Error {
  constructor(public readonly account: string) {
    super(
      `No token found for ${account}. ` +
        `Run: cd mcp/gmail-server && npm run auth -- --account ${account}`
    );
    this.name = "GmailAccountNotConfiguredError";
  }
}

function parseHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function hasAttachments(payload: gmail_v1.Schema$MessagePart | undefined): boolean {
  if (!payload) return false;
  const parts = payload.parts ?? [];
  return parts.some(
    (p) => p.filename && p.filename.length > 0 && p.mimeType !== "text/plain"
  );
}

function toEmailSummary(msg: gmail_v1.Schema$Message): EmailSummary {
  const headers = msg.payload?.headers ?? [];
  return {
    messageId: msg.id ?? "",
    subject: parseHeader(headers, "subject") || "(no subject)",
    from: parseHeader(headers, "from"),
    date: parseHeader(headers, "date"),
    snippet: msg.snippet ?? "",
    labelIds: msg.labelIds ?? [],
    hasAttachments: hasAttachments(msg.payload),
  };
}

export async function gmailSearch(
  account: string,
  query: string,
  maxResults = 50
): Promise<EmailSummary[]> {
  const auth = makeOAuth2Client(account);
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: Math.min(maxResults, 100),
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  const details = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["subject", "from", "date", "to", "cc"],
      })
    )
  );

  return details.map((r) => toEmailSummary(r.data));
}

export async function gmailGetMessage(
  account: string,
  messageId: string
): Promise<EmailDetail> {
  const auth = makeOAuth2Client(account);
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["subject", "from", "to", "cc", "date"],
  });

  const headers = res.data.payload?.headers ?? [];
  const summary = toEmailSummary(res.data);

  return {
    ...summary,
    to: parseHeader(headers, "to"),
    cc: parseHeader(headers, "cc"),
  };
}

export async function gmailListUnread(
  account: string,
  maxResults = 50
): Promise<EmailSummary[]> {
  return gmailSearch(account, "is:unread", maxResults);
}
