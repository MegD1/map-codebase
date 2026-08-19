# Atlas config schema

atlas/atlas.config.json is authored. measurements.generated.json and data.generated.js are generated.

## Top-level fields

- meta: product, hostLabel, title, repository, description, version.
- sources: glob patterns that define the full measurable source universe.
- ignore: secret, generated, dependency, binary, runtime-data, and irrelevant paths.
- groups: authored visual neighborhoods.
- nodes: subsystem ownership and prose.
- edges: source-backed directed transfers.
- flows: ordered edge IDs with inspectable payloads.

## Group

Require id, label, name, x, y, width, height, and tone.

Use stable lowercase kebab-case IDs. Supported tones in the bundled theme: cyan, green, violet, amber.

## Node

Require id, group, label, role, kind, x, y, patterns, whatItDoes, and howItsBuilt.

Let the scanner add files and metrics. Do not hand-write them. Supported kinds are presentation hints, not semantic truth: interface, runtime, renderer, gateway, agent, security, collector, worker, adapter, tool, database, test, operations, contract.

## Edge

Require id, from, to, label, kind, and evidence.

Both node IDs must exist. Every evidence path must be inside the measured source universe and exist on disk.

## Flow

Require id, label, short, color, edges, and payloads.

Use an ordered list of existing edge IDs for edges. Require id, label, type, preview, body, source, and destination for each payload.

## Generated metadata

Let the scanner add totals, mapped file count, coverage percentage, generated time, and a stable content fingerprint. The --check option recomputes the fingerprint and fails on drift, unmapped files, overlapping ownership, or missing evidence.
