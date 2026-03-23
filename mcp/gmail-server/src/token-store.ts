import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface StoredToken {
  access_token: string | null | undefined;
  refresh_token: string | null | undefined;
  expiry_date: number | null | undefined;
  token_type: string | null | undefined;
  scope: string | null | undefined;
}

export interface OAuthClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

// Resolves ~/.mlea/ respecting MLEA_TOKEN_DIR env override.
// ${HOME} is NOT substituted in .mcp.json env values by Claude Code —
// only ${CLAUDE_PLUGIN_ROOT} and ${CLAUDE_PLUGIN_DATA} are expanded there.
// We resolve HOME ourselves here.
export function getTokenDir(): string {
  return (
    process.env["MLEA_TOKEN_DIR"] ??
    path.join(os.homedir(), ".mlea", "tokens")
  );
}

export function getOAuthClientPath(): string {
  return (
    process.env["MLEA_OAUTH_CLIENT"] ??
    path.join(os.homedir(), ".mlea", "oauth-client.json")
  );
}

function tokenPath(account: string): string {
  // Sanitise the address for use as a filename
  const safe = account.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return path.join(getTokenDir(), `${safe}.json`);
}

export function loadOAuthClient(): OAuthClient {
  const p = getOAuthClientPath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `OAuth client credentials not found at ${p}.\n` +
        `Download your Desktop App credentials from GCP and save them there.\n` +
        `See mcp/gmail-server/README.md for setup instructions.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
  // GCP downloads wrap credentials under an "installed" key
  const creds = (raw["installed"] ?? raw) as Record<string, unknown>;
  return {
    client_id: creds["client_id"] as string,
    client_secret: creds["client_secret"] as string,
    redirect_uris: creds["redirect_uris"] as string[],
  };
}

// Returns null if no token exists for this account — callers handle gracefully.
export function loadToken(account: string): StoredToken | null {
  const p = tokenPath(account);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as StoredToken;
  } catch {
    return null;
  }
}

export function saveToken(account: string, token: StoredToken): void {
  const dir = getTokenDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const p = tokenPath(account);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(token, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

// Returns all accounts that have a stored token file.
export function listConfiguredAccounts(): string[] {
  const dir = getTokenDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .map((f) => f.replace(/_/g, (_, i, s) => {
      // Reverse the @ sanitisation — only the first _ that would be @ is ambiguous,
      // but in practice email addresses have exactly one @. We store the raw address
      // as the filename, so no reverse-mapping is needed; the filename IS the address.
      return f.includes("@") ? f : f; // addresses already contain @
    }));
}

// Simpler: just read filenames and strip .json — addresses are stored as-is
// (the sanitiser above only replaces truly unsafe chars, not @)
export function listAccounts(): string[] {
  const dir = getTokenDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)); // strip .json
}
