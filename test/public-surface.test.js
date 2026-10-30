import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLISHED_TEXT = [
  "package.json",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "LICENSE",
  ".github/workflows/ci.yml",
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function allowedUrl(raw) {
  const url = raw.replace(/[),.;]+$/, "");
  const bases = ["https://staleagent.com", "https://github.com/staleagent/staleagent-cli"];
  return bases.some((base) => url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}#`) || url.startsWith(`${base}.git`));
}

test("package.json is publish-ready and public", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "staleagent");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.bin.staleagent, "./src/cli.js");
  assert.deepEqual(pkg.files, ["src", "README.md", "LICENSE"]);
  assert.equal(pkg.engines.node, ">=18");
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.repository.url, "git+https://github.com/staleagent/staleagent-cli.git");
  assert.equal(pkg.homepage, "https://github.com/staleagent/staleagent-cli#readme");
  assert.equal(pkg.bugs.url, "https://github.com/staleagent/staleagent-cli/issues");
  for (const keyword of ["staleagent", "healthcheck", "cli"]) assert.ok(pkg.keywords.includes(keyword));
  assert.equal(pkg.scripts.test, "node --test");
});

test("public files only mention staleagent.com and this GitHub repo", () => {
  const files = [...walk(join(root, "src")).map((path) => relative(root, path)), ...PUBLISHED_TEXT];
  const urlPattern = /https?:\/\/[^\s"'`)<>]+/g;
  const findings = [];
  for (const relative of files) {
    const text = readFileSync(join(root, relative), "utf8");
    for (const match of text.matchAll(urlPattern)) {
      if (!allowedUrl(match[0])) findings.push(`${relative}: ${match[0]}`);
    }
    if (text.includes("cli/src/cli.js")) findings.push(`${relative}: private repo path cli/src/cli.js`);
    if (/own public repository/i.test(text)) findings.push(`${relative}: private-repo migration note`);
  }
  assert.deepEqual(findings, []);
});

test("source does not contain credential material or loopback hosts", () => {
  const patterns = [
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /github_pat_/,
    /xox[baprs]-/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /sk-[A-Za-z0-9]{20,}/,
    /localhost/,
    /127\.0\.0\.1/,
    /\.internal\b/,
    /169\.254\.169\.254/,
  ];
  const findings = [];
  for (const path of walk(join(root, "src"))) {
    const text = readFileSync(path, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(text)) findings.push(`${path}: ${pattern}`);
    }
  }
  assert.deepEqual(findings, []);
});
