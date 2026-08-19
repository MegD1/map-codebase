# Atlas authoring rules

## Nodes

- Model one responsibility boundary per node, not one file per node.
- Prefer 10–24 nodes. Split by package when a whole-repository map would exceed 24.
- Name nodes with product or architectural language: Editor Agent, Session Gate, Release Operations.
- Write whatItDoes as an outcome a teammate can recognize.
- Write howItsBuilt as the implementation choice that affects behavior, failure, security, or maintenance.
- Keep one file assigned to exactly one node. Use an edge to show collaboration instead of duplicating ownership.
- Do not author visual height, form, or stack count. The renderer derives monolith, plate, stack, or sliced-array geometry from measured source lines, file count, and average file density.
- Arrange nodes as a system model: central orchestrators near the main path, interfaces to one side, external adapters to the other, and foundations along the front or perimeter.
- Keep ASCII dots and glyphs on code-block faces. Do not add ambient particle clouds or unrelated network decoration to the ground plane.

## Groups

- Use 4–7 stable neighborhoods such as Experience, Control, Signals, Data, and Operations.
- Keep group labels short enough to scan at overview scale.
- Place frequently traversed nodes toward the center and supporting nodes near the edge.

## Edges

- Add an edge only after tracing the call, read, write, feed, or artifact transfer in source.
- Record at least one source path in evidence; record both ends when that makes the transfer easier to verify.
- Use a verb or data shape for label: POST /generate, upsert radar_items, RSS + status.json.
- Preserve direction. Model request and response as separate edges when the return path carries a meaningful payload.
- Route visible edges along the isometric ground axes instead of using freeform decorative curves.

## Flows

- Build 3–6 ordered paths that answer “what happens when…?”
- Prefer flows a newcomer will discuss: sign-in, primary create/read loop, external ingestion, background processing, publishing, deployment.
- Keep each flow to 2–8 edges. Split a very long flow at a durable boundary.

## Payloads

- Represent real data shapes with placeholder values, not copied production data.
- Include label, type, preview, body, source, and destination.
- Keep body short enough to inspect without scrolling through an entire record.
- Do not include credentials, cookies, connection strings, personal content, internal prompts, or full source excerpts.

## Copy

- Use concrete nouns and verbs. Delete claims like “powerful,” “seamless,” or “advanced.”
- Keep visible labels bilingual only when the repository already mixes languages.
- Treat monospace as metadata and paths; use a legible sans-serif for explanatory prose.
