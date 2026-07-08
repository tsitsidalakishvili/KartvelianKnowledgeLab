# Unified Graph Schema

The current MVP uses one Kartvelian graphspace. It can run from the local snapshot or from AuraDB, but the public app and API are filtered to Kartvelian records only.

## Node Conventions

Every node has labels `:Entity` + one core label, and these properties:

| Property | Meaning |
|---|---|
| `uid` | Globally unique: `kartvelian/<originalId>` |
| `originalId` | ID inside the source project |
| `graphspace` | Current value: `kartvelian` |
| `source` | Source project/dataset, e.g. `KartvelianKnowledgeLab seed` |
| `name`, `description` | Shared display fields |

Core labels: `Person`, `Place`, `Event`, `Document`, `Inscription`, `Institution`, `Corpus`, `Family`, `Theme`, `Motif`, `NarrativeVoice`, `Evidence`, `Source`, `DatasetRecord`, `ResearchTask`, `Period`, `Script`, `Language`, `Title`, `NameVariant`, `Lemma`, `ManuscriptWitness`, `TextMention`.

A `Source` carries a `sourceKind` property (`Corpus`, `Collection`, `Lexicon`, `ParallelCorpus`, `Prosopography`, `Tool`, `Treebank`) rather than a second core label.

## Relationship Conventions

Original relationship types are preserved. Every relationship carries `graphspace` and `source`, plus any original props such as `certainty`, `evidenceRefs`, `summary`, and `weight`.

## Querying the MVP Graph

```cypher
MATCH (n:Entity {graphspace: "kartvelian"}) RETURN n;
```

## Adding Sources Later

Write an importer in `src/importers/` returning `{ graphspace, nodes, relationships }` built with `makeNode` / `makeRel` from `src/lib/schema.mjs`, then register it in `scripts/ingest.mjs` when the source is ready to become part of the MVP.