const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Normalize a GitHub URL or owner/repository pair without allowing additional
 * path, query, shell, or URL components through to downstream processes.
 * @param {string} input
 */
export function normalizeGitHubRepository(input) {
  if (typeof input !== "string") {
    throw new Error("Repository must be a string");
  }

  let value = input.trim();
  if (!value) throw new Error("Repository is required");

  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Enter a valid GitHub repository URL");
    }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Only https://github.com repository URLs are supported");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) {
      throw new Error("Use a repository URL in the form github.com/owner/repository");
    }
    value = segments.join("/");
  }

  const segments = value.replace(/\.git$/i, "").split("/");
  if (segments.length !== 2) {
    throw new Error("Use a repository in the form owner/repository");
  }

  const [owner, repository] = segments;
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repository) || repository === "." || repository === "..") {
    throw new Error("Repository owner or name contains unsupported characters");
  }

  return `${owner}/${repository}`;
}

/** @param {string} repository */
export function repositorySlug(repository) {
  return normalizeGitHubRepository(repository).replace("/", "_");
}
