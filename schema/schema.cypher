// Unified graph constraints and indexes (idempotent).
// Applied automatically by scripts/ingest.mjs --write.

CREATE CONSTRAINT unified_entity_uid IF NOT EXISTS FOR (n:Entity) REQUIRE n.uid IS UNIQUE;
CREATE INDEX unified_entity_graphspace IF NOT EXISTS FOR (n:Entity) ON (n.graphspace);
CREATE INDEX unified_entity_name IF NOT EXISTS FOR (n:Entity) ON (n.name);
CREATE INDEX unified_entity_original IF NOT EXISTS FOR (n:Entity) ON (n.originalId);
CREATE FULLTEXT INDEX unified_entity_search IF NOT EXISTS FOR (n:Entity) ON EACH [n.name, n.description];
