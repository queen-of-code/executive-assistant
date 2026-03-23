#!/usr/bin/env node
/**
 * One-time OAuth2 authentication flow for a single Gmail account.
 * Run: npm run auth -- --account melissa@queenofcode.dev
 *
 * Opens a browser for consent, stores the refresh token in ~/.mea/tokens/.
 */
import * as http from "http";
import * as readline from "readline";
import { google } from "googleapis";
import open from "open";
import {
  loadOAuthClient,
  saveToken,
  loadToken,
  getTokenDir,
} from "./token-store.js";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function parseArgs(): { account: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--account");
  if (idx === -1 || !args[idx + 1]) {
    console.error("Usage: npm run auth -- --account <email@example.com>");
    process.exit(1);
  }
  return { account: args[idx + 1] };
}

async function waitForCode(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      if (code) {
        res.end(
          "<html><body><h2>✅ Authenticated! You can close this tab.</h2></body></html>"
        );
        server.close();
        resolve(code);
      } else {
        res.end(
          `<html><body><h2>❌ Error: ${error ?? "unknown"}. Close this tab and try again.</h2></body></html>`
        );
        server.close();
        reject(new Error(`OAuth error: ${error ?? "unknown"}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const { account } = parseArgs();

  const existing = loadToken(account);
  if (existing?.refresh_token) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) =>
      rl.question(
        `⚠️  A token for ${account} already exists. Re-authenticate? (y/N) `,
        resolve
      )
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Aborted — existing token kept.");
      process.exit(0);
    }
  }

  let clientCreds: ReturnType<typeof loadOAuthClient>;
  try {
    clientCreds = loadOAuthClient();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientCreds.client_id,
    clientCreds.client_secret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // force refresh_token to be returned every time
    login_hint: account,
  });

  // Start local redirect server before opening browser
  const server = http.createServer();
  await new Promise<void>((resolve) =>
    server.listen(REDIRECT_PORT, "127.0.0.1", resolve)
  );

  console.log(`\nAuthenticating ${account}...`);
  console.log(`Opening browser. If it doesn't open automatically, visit:\n${authUrl}\n`);
  await open(authUrl);

  let code: string;
  try {
    code = await waitForCode(server);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "❌ No refresh token returned. This can happen if the account was already authorised.\n" +
        "   Revoke access at https://myaccount.google.com/permissions and run again."
    );
    process.exit(1);
  }

  saveToken(account, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    token_type: tokens.token_type,
    scope: tokens.scope,
  });

  console.log(`✅ Token saved to ${getTokenDir()}/${account}.json`);
  console.log(`   Scopes: ${tokens.scope}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
