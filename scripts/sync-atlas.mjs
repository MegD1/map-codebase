#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const argumentsList = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argumentsList.indexOf(name);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : fallback;
};

const projectRoot = resolve(option("--root", process.cwd()));
const configPath = resolve(projectRoot, option("--config", "atlas/atlas.config.json"));
const checkOnly = argumentsList.includes("--check");
const jsonOutputPath = resolve(projectRoot, option("--json", "atlas/measurements.generated.json"));
const browserOutputPath = resolve(projectRoot, option("--browser", "atlas/data.generated.js"));

const toPosix = (value) => value.split(sep).join("/");

function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/u);
  if (!match) return [pattern];
  return match[1].split(",").flatMap((choice) => expandBraces(
    `${pattern.slice(0, match.index)}${choice}${pattern.slice(match.index + match[0].length)}`,
  ));
}

function globToRegExp(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      const isDouble = pattern[index + 1] === "*";
      if (isDouble) {
        const followedBySlash = pattern[index + 2] === "/";
        expression += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else expression += "[^/]*";
    } else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  }
  return new RegExp(`${expression}$`, "u");
}

const patternCache = new Map();
function matches(path, patterns = []) {
  return patterns.some((pattern) => {
    if (!patternCache.has(pattern)) {
      patternCache.set(pattern, expandBraces(pattern).map(globToRegExp));
    }
    return patternCache.get(pattern).some((expression) => expression.test(path));
  });
}

async function walk(directory, ignorePatterns, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const path = toPosix(relative(projectRoot, absolutePath));
    if (matches(path, ignorePatterns) || matches(`${path}/`, ignorePatterns)) continue;
    if (entry.isDirectory()) await walk(absolutePath, ignorePatterns, files);
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function measure(path) {
  const absolutePath = join(projectRoot, path);
  const [content, information] = await Promise.all([
    readFile(absolutePath, "utf8").catch(() => ""),
    stat(absolutePath),
  ]);
  return {
    path,
    bytes: information.size,
    lines: content ? content.split(/\r?\n/u).length : 0,
  };
}

function stablePayload(value) {
  return JSON.stringify(value, null, 2);
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(jsonOutputPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const ignorePatterns = [
    ".git/**",
    "node_modules/**",
    ".pnpm-store/**",
    "**/.env*",
    "**/.DS_Store",
    ...(config.ignore || []),
  ];
  const discovered = (await walk(projectRoot, ignorePatterns))
    .filter((path) => matches(path, config.sources || []))
    .sort((left, right) => left.localeCompare(right));

  const measuredFiles = await Promise.all(discovered.map(measure));
  const assignments = new Map();
  const overlaps = [];
  const nodes = config.nodes.map((node) => {
    const files = measuredFiles.filter((file) => matches(file.path, node.patterns || []));
    for (const file of files) {
      if (assignments.has(file.path)) overlaps.push({ file: file.path, nodes: [assignments.get(file.path), node.id] });
      else assignments.set(file.path, node.id);
    }
    const metrics = files.reduce((total, file) => ({
      files: total.files + 1,
      lines: total.lines + file.lines,
      bytes: total.bytes + file.bytes,
    }), { files: 0, lines: 0, bytes: 0 });
    return { ...node, files: files.map(({ path, lines, bytes }) => ({ path, lines, bytes })), metrics };
  });

  const unmapped = measuredFiles.filter((file) => !assignments.has(file.path));
  const evidenceMissing = (config.edges || []).flatMap((edge) => (edge.evidence || [])
    .filter((path) => !measuredFiles.some((file) => file.path === path))
    .map((path) => ({ edge: edge.id, path })));
  const totals = measuredFiles.reduce((total, file) => ({
    files: total.files + 1,
    lines: total.lines + file.lines,
    bytes: total.bytes + file.bytes,
  }), { files: 0, lines: 0, bytes: 0 });
  const mappedFiles = totals.files - unmapped.length;
  const coverage = totals.files ? Math.round((mappedFiles / totals.files) * 1000) / 10 : 100;
  const graph = {
    meta: {
      ...config.meta,
      generatedAt: new Date().toISOString(),
      totals,
      mappedFiles,
      coverage,
      fingerprint: "",
    },
    groups: config.groups || [],
    nodes,
    edges: config.edges || [],
    flows: config.flows || [],
    unmapped,
    overlaps,
    evidenceMissing,
  };
  const fingerprintInput = structuredClone(graph);
  delete fingerprintInput.meta.generatedAt;
  delete fingerprintInput.meta.fingerprint;
  graph.meta.fingerprint = createHash("sha256").update(stablePayload(fingerprintInput)).digest("hex").slice(0, 12);

  if (checkOnly) {
    const previous = await readPrevious();
    if (!previous) throw new Error(`Missing generated atlas data: ${toPosix(relative(projectRoot, jsonOutputPath))}`);
    if (previous.meta?.fingerprint !== graph.meta.fingerprint) {
      throw new Error(`Repository atlas is stale. Run: node ${toPosix(relative(projectRoot, fileURLToPath(import.meta.url)))} --root .`);
    }
    if (unmapped.length || overlaps.length || evidenceMissing.length) {
      throw new Error(`Atlas validation failed: ${unmapped.length} unmapped, ${overlaps.length} overlapping, ${evidenceMissing.length} missing evidence paths`);
    }
    console.log(`RepoScope current · ${totals.files} files · ${totals.lines.toLocaleString("en-US")} lines · ${coverage}% mapped · ${graph.meta.fingerprint}`);
    return;
  }

  await writeFile(jsonOutputPath, `${stablePayload(graph)}\n`, "utf8");
  await writeFile(browserOutputPath, `window.REPO_ATLAS_DATA = ${stablePayload(graph)};\n`, "utf8");
  console.log(`RepoScope synced · ${totals.files} files · ${totals.lines.toLocaleString("en-US")} lines · ${coverage}% mapped`);
  console.log(`Generated ${toPosix(relative(projectRoot, jsonOutputPath))} and ${toPosix(relative(projectRoot, browserOutputPath))}`);
  if (unmapped.length) console.warn(`Unmapped (${unmapped.length}): ${unmapped.map((file) => file.path).join(", ")}`);
  if (overlaps.length) console.warn(`Overlaps (${overlaps.length}): ${overlaps.map((entry) => `${entry.file} -> ${entry.nodes.join(" + ")}`).join(", ")}`);
  if (evidenceMissing.length) console.warn(`Missing evidence (${evidenceMissing.length}): ${evidenceMissing.map((entry) => `${entry.edge}: ${entry.path}`).join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
