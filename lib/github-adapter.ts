import type {
  CreateIssueParams,
  Issue,
  IssueFilters,
  GitHubTrackerConfig,
} from "./types";

// ─── Interface ────────────────────────────────────────────────────────────────

// Defined as an interface so future adapters (Linear, Jira) can slot in
// without changing any calling code. GitHub is the only implementation in Phase 1.
export interface IssueTrackerAdapter {
  createIssue(params: CreateIssueParams): Promise<{ number: number; url: string }>;
  closeIssue(issueNumber: number): Promise<void>;
  findSimilar(title: string, windowDays: number): Promise<Issue[]>;
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  removeLabels(issueNumber: number, labels: string[]): Promise<void>;
  listIssues(filters: IssueFilters): Promise<Issue[]>;
  getIssue(issueNumber: number): Promise<Issue | null>;
  ensureLabelsExist(labels: string[]): Promise<void>;
}

// ─── GitHub REST Client ───────────────────────────────────────────────────────

// IMPORTANT: This adapter is only used when GITHUB_TOKEN is set in the environment.
// When MEA runs inside Claude Cowork with the GitHub MCP connector attached, the
// agent should call GitHub MCP tools directly (create_issue, get_repo, etc.) and
// NOT instantiate this class. The skill/command docs govern which path is taken.
//
// This class exists for:
//   - Local CLI usage or GitHub Actions where GITHUB_TOKEN is available
//   - Testing outside Cowork
//
// The calling agent must check: if GitHub MCP tools are available → use them.
// If only GITHUB_TOKEN is available → use this class.
// If neither → fail clearly with instructions for both paths.
export class GitHubAdapter implements IssueTrackerAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly assignToSelf: boolean;

  constructor(config: GitHubTrackerConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.assignToSelf = config.assignToSelf;

    const token = process.env["GITHUB_TOKEN"];
    if (!token) {
      throw new Error(
        "GitHubAdapter requires GITHUB_TOKEN but it is not set.\n" +
          "If you are running inside Claude Cowork with the GitHub connector attached,\n" +
          "use the GitHub MCP tools directly instead of instantiating GitHubAdapter.\n" +
          "If running outside Cowork, set GITHUB_TOKEN with repo scope."
      );
    }
    this.token = token;
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = path.startsWith("https://") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub API error ${res.status} at ${url}: ${body}`
      );
    }

    // 204 No Content — return empty object
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createIssue(
    params: CreateIssueParams
  ): Promise<{ number: number; url: string }> {
    interface GitHubIssueResponse {
      number: number;
      html_url: string;
    }

    const body: Record<string, unknown> = {
      title: params.title,
      body: params.body,
      labels: params.labels,
    };
    if (this.assignToSelf && params.assignee) {
      body["assignees"] = [params.assignee];
    }

    const created = await this.request<GitHubIssueResponse>("/issues", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return { number: created.number, url: created.html_url };
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.request(`/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
  }

  async getIssue(issueNumber: number): Promise<Issue | null> {
    try {
      const raw = await this.request<RawGitHubIssue>(`/issues/${issueNumber}`);
      return toIssue(raw);
    } catch {
      return null;
    }
  }

  async listIssues(filters: IssueFilters): Promise<Issue[]> {
    const params = new URLSearchParams();
    params.set("state", filters.state ?? "open");
    params.set("per_page", "100");
    if (filters.labels?.length) {
      params.set("labels", filters.labels.join(","));
    }
    if (filters.createdAfter) {
      params.set("since", filters.createdAfter);
    }
    if (filters.search) {
      // GitHub issues list doesn't support full-text search; use search API
      return this.searchIssues(filters);
    }

    const raw = await this.request<RawGitHubIssue[]>(
      `/issues?${params.toString()}`
    );
    return raw.map(toIssue);
  }

  private async searchIssues(filters: IssueFilters): Promise<Issue[]> {
    interface SearchResponse {
      items: RawGitHubIssue[];
    }

    const q = [
      `repo:${this.owner}/${this.repo}`,
      `is:issue`,
      `is:${filters.state ?? "open"}`,
      filters.search ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const res = await this.request<SearchResponse>(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100`
    );
    return res.items.map(toIssue);
  }

  async findSimilar(title: string, windowDays: number): Promise<Issue[]> {
    const since = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000
    ).toISOString();
    // Search for recently created open issues with keywords from the title
    const keywords = title
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
      .join(" ");
    return this.searchIssues({
      state: "open",
      search: keywords,
      createdAfter: since,
    });
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.request(`/issues/${issueNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  async removeLabels(issueNumber: number, labels: string[]): Promise<void> {
    for (const label of labels) {
      try {
        await this.request(
          `/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
          { method: "DELETE" }
        );
      } catch {
        // Label may not exist on this issue — safe to ignore
      }
    }
  }

  async ensureLabelsExist(labels: string[]): Promise<void> {
    interface LabelResponse {
      name: string;
    }

    const existing = await this.request<LabelResponse[]>(
      "/labels?per_page=100"
    );
    const existingNames = new Set(existing.map((l) => l.name));

    for (const label of labels) {
      if (!existingNames.has(label)) {
        await this.request("/labels", {
          method: "POST",
          body: JSON.stringify({
            name: label,
            color: labelColor(label),
          }),
        });
      }
    }
  }
}

// ─── Raw API Types ────────────────────────────────────────────────────────────

interface RawGitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  state: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

function toIssue(raw: RawGitHubIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    labels: raw.labels.map((l) => l.name),
    state: raw.state === "closed" ? "closed" : "open",
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    url: raw.html_url,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Deterministic color per tag dimension prefix so labels are visually grouped
function labelColor(label: string): string {
  const colorMap: Record<string, string> = {
    "domain/": "0075ca",
    "source/": "e4e669",
    "type/": "d93f0b",
    "urgency/": "b60205",
    "time/": "0e8a16",
    "person/": "5319e7",
    "status/": "f9d0c4",
    "mailbox/": "c2e0c6",
  };
  for (const [prefix, color] of Object.entries(colorMap)) {
    if (label.startsWith(prefix)) return color;
  }
  return "ededed";
}
