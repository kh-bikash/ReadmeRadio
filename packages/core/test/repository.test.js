import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubRepository, repositorySlug } from "../src/repository.js";

test("normalizes URL and shorthand repository inputs", () => {
  assert.equal(normalizeGitHubRepository("https://github.com/pallets/flask"), "pallets/flask");
  assert.equal(normalizeGitHubRepository("pallets/flask.git"), "pallets/flask");
  assert.equal(repositorySlug("pallets/flask"), "pallets_flask");
});

test("rejects extra URL and shell components", () => {
  assert.throws(() => normalizeGitHubRepository("https://example.com/pallets/flask"));
  assert.throws(() => normalizeGitHubRepository("pallets/flask/extra"));
  assert.throws(() => normalizeGitHubRepository('pallets/flask\" & whoami'));
});
