/**
 * Publishes a file to a public GitHub repo via the Contents API.
 * Auth: a fine-grained PAT in GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN
 * (or legacy GITHUB_PAT), or the Lovable GitHub connector gateway
 * (GITHUB_API_KEY + LOVABLE_API_KEY) when no PAT is configured.
 */

const OWNER = "cipolokwane";
const REPO = "copier-data-fetcher";
const BRANCH = "main";

type Mode = { url: string; headers: Record<string, string> };

function mode(): Mode {
  const pat = process.env["GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN"] || process.env["GITHUB_PAT"];
  if (pat) {
    return {
      url: `https://api.github.com/repos/${OWNER}/${REPO}/contents`,
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "canon-fleet-reporter",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectorKey = process.env["GITHUB_API_KEY"];
  if (lovableKey && connectorKey) {
    return {
      url: `https://connector-gateway.lovable.dev/github/repos/${OWNER}/${REPO}/contents`,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectorKey,
        Accept: "application/vnd.github+json",
      },
    };
  }
  throw new Error("GitHub access is not configured (missing GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN or GitHub connector).");
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function currentSha(m: Mode, path: string): Promise<string | undefined> {
  const res = await fetch(`${m.url}/${path}?ref=${BRANCH}`, { headers: m.headers });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GitHub read ${path} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { sha?: string };
  return body.sha;
}

export async function publishFile(path: string, content: string, message: string): Promise<string> {
  const m = mode();
  const sha = await currentSha(m, path);
  const res = await fetch(`${m.url}/${path}`, {
    method: "PUT",
    headers: { ...m.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      branch: BRANCH,
      content: toBase64(content),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub write ${path} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

export type MeterFileCommit = {
  sha: string;
  date: string;
  message: string;
};

export async function listMeterFileCommits(since: string, until: string) {
  const m = mode();
  const repoUrl = m.url.replace(/\/contents$/, "");
  const commits: MeterFileCommit[] = [];
  const maxPages = 20;
  let page = 1;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      path: "data/meters.csv",
      since,
      until,
      per_page: "100",
      page: String(page),
    });
    const response = await fetch(`${repoUrl}/commits?${params.toString()}`, {
      headers: m.headers,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`GitHub snapshot history failed [${response.status}]: ${(await response.text()).slice(0, 300)}`);
    }
    const batch = (await response.json()) as {
      sha?: string;
      commit?: { author?: { date?: string }; committer?: { date?: string }; message?: string };
    }[];
    for (const item of batch) {
      const sha = item.sha;
      const date = item.commit?.committer?.date ?? item.commit?.author?.date;
      if (sha && date) {
        commits.push({ sha, date, message: item.commit?.message ?? "Meter snapshot" });
      }
    }
    if (batch.length < 100) break;
    page += 1;
  }

  return { commits, truncated: page > maxPages };
}

export async function readMeterFileAtCommit(sha: string): Promise<string> {
  const m = mode();
  const response = await fetch(`${m.url}/data/meters.csv?ref=${encodeURIComponent(sha)}`, {
    headers: m.headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub snapshot read failed [${response.status}]: ${(await response.text()).slice(0, 300)}`);
  }
  const file = (await response.json()) as { content?: string; encoding?: string };
  if (!file.content || file.encoding !== "base64") throw new Error("GitHub returned an unreadable meter snapshot.");
  const binary = atob(file.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
