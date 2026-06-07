// Tag-based publish for this GitHub Action (no npm publish).
//
// Reads the version from package.json; if the tag does not already exist,
// creates the annotated tag vX.Y.Z, force-moves the major tag (vX), pushes
// both, and cuts a GitHub release using the matching CHANGELOG.md section.
//
// Runs inside the release workflow where GITHUB_TOKEN/GH_TOKEN is available
// so the `gh` CLI is authenticated. Fails loudly on any error other than the
// idempotent "tag already exists" check.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";

// Run a command, capturing its output. Throws on a non-zero exit.
const capture = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();
// Run a command, streaming its output to the workflow log. Throws on failure.
const stream = (cmd) => execSync(cmd, { stdio: "inherit" });

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const major = `v${version.split(".")[0]}`;

// Idempotency: if this version is already tagged locally, there is nothing to
// publish (e.g. the workflow re-ran). Exit cleanly.
if (capture(`git tag --list ${tag}`) === tag) {
  console.log(`Tag ${tag} already exists; nothing to publish.`);
  process.exit(0);
}

// Identify commits/tags as the GitHub Actions bot.
stream('git config user.name "github-actions[bot]"');
stream(
  'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
);

// Create the exact-version tag and (force-)move the rolling major tag.
stream(`git tag -a ${tag} -m "${tag}"`);
stream(`git tag -f -a ${major} -m "${major} -> ${tag}"`);
stream(`git push origin ${tag}`);
stream(`git push -f origin ${major}`);

// Extract the newest CHANGELOG.md section: from the first `## ` heading up to
// (but not including) the next `## ` heading. Fall back to the tag name if the
// changelog has no sections yet.
const changelog = readFileSync("CHANGELOG.md", "utf8");
const match = changelog.match(/^## [\s\S]*?(?=^## |$(?![\s\S]))/m);
const notes = match ? match[0].trim() : tag;

const notesFile = "CHANGELOG-latest.md";
writeFileSync(notesFile, `${notes}\n`);
try {
  stream(
    `gh release create ${tag} --title ${tag} --latest --notes-file ${notesFile}`,
  );
} finally {
  unlinkSync(notesFile);
}

console.log(`Published ${tag} and moved ${major}.`);
