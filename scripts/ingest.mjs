// Unified ingestion pipeline: importers -> validation -> AuraDB (or dry-run).
//
//   node scripts/ingest.mjs --dry-run          write data/merged-graph.json only
//   node --env-file=.env scripts/ingest.mjs --write   apply schema + merge into AuraDB
//
// Safe by design: without --write (or without credentials) nothing touches Neo4j.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importKartvelian } from "../src/importers/kartvelian.mjs";
import { importInstitutions } from "../src/importers/institutions.mjs";
import { validateMerged } from "../src/lib/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(DATA_DIR, "merged-graph.json");
const SCHEMA_FILE = path.join(__dirname, "..", "schema", "schema.cypher");

const IMPORTERS = [importKartvelian, importInstitutions];

export function buildMergedGraph() {
  const nodes = [];
  const relationships = [];
  const perSpace = {};
  for (const importer of IMPORTERS) {
    const result = importer();
    nodes.push(...result.nodes);
    relationships.push(...result.relationships);
    const prev = perSpace[result.graphspace] || { nodes: 0, relationships: 0 };
    perSpace[result.graphspace] = {
      nodes: prev.nodes + result.nodes.length,
      relationships: prev.relationships + result.relationships.length,
    };
  }
  return { nodes, relationships, perSpace };
}

async function writeToNeo4j(graph) {
  const { getDriver, getSession } = await import("../src/lib/neo4j.mjs");
  const driver = await getDriver();
  const session = getSession(driver);
  try {
    // 1. Constraints and indexes
    const schema = await readFile(SCHEMA_FILE, "utf8");
    for (const stmt of schema.split(";").map((s) => s.replace(/\/\/[^\n]*/g, "").trim()).filter(Boolean)) {
      await session.run(stmt);
    }

    // 2. Nodes, batched per label combination
    const byLabels = new Map();
    for (const n of graph.nodes) {
      const key = n.labels.join(":");
      if (!byLabels.has(key)) byLabels.set(key, []);
      byLabels.get(key).push({ uid: n.uid, props: n.props });
    }
    for (const [labelKey, rows] of byLabels) {
      console.log(`Merging ${rows.length} :${labelKey} nodes...`);
      await session.run(
        `UNWIND $rows AS row
         MERGE (n:${labelKey.split(":").join(":")} {uid: row.uid})
         SET n += row.props`,
        { rows }
      );
    }

    // 3. Relationships, batched per type
    const byType = new Map();
    for (const r of graph.relationships) {
      if (!byType.has(r.type)) byType.set(r.type, []);
      byType.get(r.type).push({ uid: r.uid, from: r.from, to: r.to, props: r.props });
    }
    for (const [type, rows] of byType) {
      console.log(`Merging ${rows.length} :${type} relationships...`);
      await session.run(
        `UNWIND $rows AS row
         MATCH (a:Entity {uid: row.from})
         MATCH (b:Entity {uid: row.to})
         MERGE (a)-[r:${type} {uid: row.uid}]->(b)
         SET r += row.props`,
        { rows }
      );
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes("--write");

  const graph = buildMergedGraph();
  const problems = validateMerged(graph);
  if (problems.length) {
    console.error("Validation failed:");
    for (const p of problems) console.error(" -", p);
    process.exit(1);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(graph, null, 2));
  console.log("Validated merged graph:");
  for (const [space, stats] of Object.entries(graph.perSpace)) {
    console.log(`  ${space}: ${stats.nodes} nodes, ${stats.relationships} relationships`);
  }
  console.log(`  total: ${graph.nodes.length} nodes, ${graph.relationships.length} relationships`);
  console.log(`Snapshot written to ${path.relative(process.cwd(), OUT_FILE)}`);

  if (write) {
    await writeToNeo4j(graph);
    console.log("AuraDB ingest complete.");
  } else {
    console.log("Dry run (no --write): AuraDB untouched.");

  }
}
