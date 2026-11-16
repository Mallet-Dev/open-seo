import { execFileSync } from "node:child_process";

export const releaseRepository = "Mallet-Dev/open-seo";
export const releaseBranch = "workbench";

/** @param {string} repository @param {string} tag @param {string} commit */
export function verifyReleaseTarget(repository, tag, commit) {
  /** @param {string} endpoint @param {string} filter */
  const read = (endpoint, filter) =>
    execFileSync(
      "gh",
      ["api", `repos/${repository}/${endpoint}`, "--jq", filter],
      { encoding: "utf8" },
    ).trim();
  const published = read(`git/ref/heads/${releaseBranch}`, ".object.sha");
  if (published !== commit)
    throw new Error(
      "The selected commit must match the published workbench branch.",
    );
  const encoded = encodeURIComponent(tag);
  const refs = read(`git/matching-refs/tags/${encoded}`, ".[].ref").split("\n");
  if (
    refs.includes(`refs/tags/${tag}`) &&
    read(`commits/${encoded}`, ".sha") !== commit
  ) {
    throw new Error(
      `Tag ${tag} already identifies a different commit. Choose an unused version.`,
    );
  }
}
