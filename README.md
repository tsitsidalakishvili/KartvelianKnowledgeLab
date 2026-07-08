# Unified Graph

Kartvelian Knowledge Universe MVP: one local/Neo4j-backed knowledge graph for Kartvelian historical, linguistic, source-ingestion, and explainable-AI research.

## Architecture

```text
src/importers/kartvelian.mjs -> validation -> data/merged-graph.json -> server/app
```

The Kartvelian graphspace is a self-contained snapshot at `data/kartvelian-seed.mjs` (240 nodes / 520 relationships): the full former KartvelianKnowledgeLab dataset plus curated enrichment, connectivity, source-deepening, and source catalog records.

Schema conventions: see [schema/SCHEMA.md](schema/SCHEMA.md).

## Capabilities

- Source-ingestion provenance: `Source -> DatasetRecord -> Entity` with `CONTAINS_RECORD`, `SOURCE_RECORD_FOR`, `AUTHORITY_FOR`, `MENTIONS`, and `SUPPORTS_TASK`.
- Historical Georgian entity linking scaffolding: `NameVariant`, `Script`, `Language`, and reviewable link candidates.
- Graph-grounded research paths: inspectable paths where every hop carries source/provenance metadata.
- Immersive timeline universe: full-screen, scroll-driven Kartvelian graph exploration inspired by the existing KartvelianKnowledgeLab demo and the Hitparade timeline reference.

## Run

```powershell
npm run mvp
# open http://localhost:3020
```

The MVP runs from the local snapshot and uses AuraDB automatically if `.env` credentials exist. The server filters AuraDB reads to `graphspace = "kartvelian"`.

## Data Pipeline

```powershell
npm install
npm run ingest:dry   # build + validate data/merged-graph.json, no DB writes
npm run validate
npm run ingest       # write/refresh Kartvelian graph records in Neo4j
```

`ingest` is idempotent (`MERGE` on `uid`) and applies constraints/indexes from `schema/schema.cypher`.

## Status

- [x] Kartvelian schema + provenance conventions
- [x] Full Kartvelian baked snapshot
- [x] Source-ingestion provenance layer
- [x] Dry-run pipeline + validation
- [x] Scroll-driven immersive graph MVP
- [ ] Review UI for link candidates
- [ ] Confirmed-links writer
- [ ] Wikidata QID alignment
- [ ] Graph-grounded historian read API

## Regenerating the Kartvelian Snapshot

`data/kartvelian-seed.mjs` is baked, not hand-edited. It was consolidated from the former KartvelianKnowledgeLab scripts via `scripts/consolidate-kartvelian.mjs`; that script is retained as provenance for the snapshot.