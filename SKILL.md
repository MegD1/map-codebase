---
name: map-codebase
description: Build or update an interactive repository atlas with measured modules, evidence-backed call paths, inspectable moving payloads, and a freshness check. Use when Codex needs to visualize, explain, onboard to, or discuss how a codebase works; when someone asks for a codebase map, architecture diagram, system walkthrough, dependency view, animated data flow, or a visual way to inspect a repository.
---

# Map Codebase

Turn a repository into a navigable system model: code subsystems become measured nodes, source-backed calls become edges, and moving particles carry data snippets that a reader can inspect and copy into a discussion with Codex.

## Keep these invariants

- Author meaning; measure size. Read the code to write node purpose, implementation notes, flows, and payloads. Let the scanner derive file counts, line counts, bytes, coverage, and fingerprints.
- Draw only traceable edges. Give every edge one or more real source paths in the evidence field.
- Make motion informative. Every moving particle must name a real request, event, record, artifact, or response shape.
- Make volume measurable. Render subsystems as isometric monoliths, plates, stacks, or sliced arrays selected from source lines, file count, and average file density.
- Keep the ground structural. Use an isometric grid, system boundaries, and evidence-backed routes; place deterministic ASCII texture on code faces instead of filling the background with decorative particles.
- Keep source content private. Scan text only for measurements; never emit file contents, environment values, credentials, cookies, runtime databases, build output, or user data.
- Keep the atlas useful without animation. Support pause, single-step, keyboard inspection, and prefers-reduced-motion.

## Workflow

### 1. Detect the repository

Inspect the package manifest, router, primary entry points, styles or design tokens, test runner, workspaces, deployment definitions, and any existing atlas/atlas.config.json. Do not ask for facts the repository answers.

Default to:

- route: /atlas/index.html for a static application, or /~/architecture when the framework has a router;
- scope: application source, tests, operational scripts, and authored knowledge contracts;
- style: the host design system when it is legible for dense graphs, otherwise the bundled Neo-Swiss computational theme;
- freshness: a committed generated JSON file plus a --check command in CI.

Ask only when an existing route, design-system decision, or requested scope makes these defaults unsafe.

### 2. Read the authoring rules

Read references/authoring.md before defining nodes or flows. Read references/schema.md before writing the config or changing the generated-data contract.

### 3. Install the core

Resolve SKILL_DIR as the absolute directory containing this file. Copy the static core and the sync script into the target repository:

~~~bash
mkdir -p atlas scripts
cp "$SKILL_DIR/assets/atlas-template/index.html" atlas/index.html
cp "$SKILL_DIR/assets/atlas-template/atlas.css" atlas/atlas.css
cp "$SKILL_DIR/assets/atlas-template/atlas.js" atlas/atlas.js
cp "$SKILL_DIR/scripts/sync-atlas.mjs" scripts/sync-atlas.mjs
~~~

For a new atlas, copy assets/atlas.config.example.json to atlas/atlas.config.json and replace every example value. For an update, never overwrite the existing config, authored prose, node positions, flow order, or theme overrides.

Add repository scripts equivalent to:

~~~json
{
  "atlas:sync": "node scripts/sync-atlas.mjs --root .",
  "atlas:check": "node scripts/sync-atlas.mjs --root . --check"
}
~~~

### 4. Author the system model

Create 4–7 groups and 10–24 nodes. Use names the team would use, not raw directory names. For every node:

- claim exact source patterns;
- state what it does in plain language;
- state the most useful implementation decision;
- assign a stable authored position;
- keep path lists real and reviewable.

Trace 3–6 user-visible or operational flows from source. Prefer the primary read/write loop, authentication, one background job, one expensive or security-sensitive path, and deployment when present.

Define 1–3 payloads per flow. Use compact, representative examples with placeholder values. Never copy secrets, personal content, full prompts, or proprietary records into payload examples.

### 5. Measure and close coverage

Run:

~~~bash
node scripts/sync-atlas.mjs --root .
~~~

Resolve every unmapped source, overlap, and missing evidence path. Narrow patterns instead of allowing one file to belong to multiple nodes. Exclude generated, secret, binary, dependency, and runtime-data directories explicitly.

### 6. Mount and verify

Add a navigation entry or route without displacing the product's primary workflow. Add noindex, nofollow when the page could be reachable outside a local environment.

Verify:

1. Run syntax, type, lint, and repository tests.
2. Run node scripts/sync-atlas.mjs --root . --check.
3. Open the atlas in the running application.
4. Test every flow, payload, node, search result, pause/resume, single-step, pan, zoom, reset, context copy, and keyboard path.
5. Inspect desktop and mobile layouts and reduced-motion behavior.
6. Confirm the browser console has no errors and the page exposes no ignored source or secret content.

## Update an existing atlas

Run the sync first. Treat unmapped files as drift, not permission to regenerate the authored graph. Add or expand only the affected nodes and flows. Preserve stable node IDs and positions so links, screenshots, and team memory do not churn.

## Report the result honestly

State the measured file/line coverage and validation result. Identify authored descriptions as a first-pass explanation that the repository owner can refine. Never imply that automated measurements prove the prose is semantically complete.
