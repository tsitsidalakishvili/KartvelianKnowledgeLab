// One-time bake: consolidate the full KartvelianKnowledgeLab dataset into a
// single self-contained snapshot (data/kartvelian-seed.mjs) that the unified
// importer reads. Run this while the KKL sibling repo still exists; afterwards
// the unified graph no longer depends on it.
//
//   node scripts/consolidate-kartvelian.mjs
//
// It reads KKL's data-definition scripts (seed, curated-enrichment,
// connectivity-expansion, source-deepening) plus the source-catalog, evaluates
// only their data arrays (never their Neo4j write code), merges + de-duplicates,
// and emits {label,id,props} nodes and {type,from,to,...props} relationships.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KKL_SCRIPTS = path.resolve(__dirname, "..", "..", "KartvelianKnowledgeLab", "scripts");
const OUT_FILE = path.join(__dirname, "..", "data", "kartvelian-seed.mjs");
const TMP_DIR = path.join(__dirname, "..", ".consolidate-tmp");

// Evaluate the data arrays (const nodes / const relationships) from an
// imperative KKL script by slicing off everything from the Neo4j section on,
// stubbing `process` so the env guard can't exit, and importing the remainder.
async function loadImperativeData(fileName) {
  const raw = (await readFile(path.join(KKL_SCRIPTS, fileName), "utf8")).replace(/^﻿/, "");
  const markers = ["\nconst allowedLabels", "\nasync function main", "\nmain("];
  let cut = raw.length;
  for (const m of markers) {
    const i = raw.indexOf(m);
    if (i !== -1 && i < cut) cut = i;
  }
  const sliced = raw
    .slice(0, cut)
    .split("\n")
    .filter((line) => !/^\s*import\s+neo4j\s+from/.test(line))
    .join("\n");

  const shim =
    "const process = { env: { NEO4J_URI: 'x', NEO4J_USERNAME: 'x', NEO4J_PASSWORD: 'x', NEO4J_DATABASE: 'neo4j' }, exit() {}, argv: [] };\n";
  const moduleText = `${shim}${sliced}\nexport { nodes, relationships };\n`;

  await mkdir(TMP_DIR, { recursive: true });
  const tmpFile = path.join(TMP_DIR, `${fileName}.eval.mjs`);
  await writeFile(tmpFile, moduleText);
  const mod = await import(pathToFileURL(tmpFile).href);
  return { nodes: mod.nodes || [], relationships: mod.relationships || [] };
}

// Expand the source catalog into Source / DatasetRecord / ResearchTask nodes
// and their provenance relationships (mirrors KKL scripts/import-sources.mjs,
// but as plain data instead of Cypher writes).
function expandSourceCatalog(sourceCatalog, researchTasks) {
  const nodes = [];
  const relationships = [];

  for (const task of researchTasks) {
    nodes.push({ label: "ResearchTask", id: task.id, props: { name: task.name, description: task.description } });
  }

  for (const source of sourceCatalog) {
    nodes.push({
      label: "Source",
      id: source.id,
      props: {
        name: source.name,
        localName: source.localName,
        url: source.url,
        year: source.year,
        priority: source.priority,
        domain: source.domain,
        description: source.description,
        importStatus: source.records.length ? "sampled" : "catalogued",
        sourceKind: source.label,
      },
    });

    const taskTargets = new Set();
    for (const record of source.records) {
      nodes.push({
        label: "DatasetRecord",
        id: record.id,
        props: {
          name: record.name,
          year: record.year,
          description: record.description,
          sourceName: source.name,
          sourceUrl: source.url,
          sourceDomain: source.domain,
          importStatus: "sample",
        },
      });
      relationships.push({ type: "CONTAINS_RECORD", from: source.id, to: record.id, importStatus: "sample" });
      for (const link of record.links || []) {
        relationships.push({ type: link.type, from: record.id, to: link.target, sourceRecord: record.id });
        if (link.type === "SUPPORTS_TASK") taskTargets.add(link.target);
      }
    }
    for (const taskId of taskTargets) {
      relationships.push({ type: "SUPPORTS_TASK", from: source.id, to: taskId, domain: source.domain });
    }
  }

  return { nodes, relationships };
}

async function main() {
  const catalog = await import(pathToFileURL(path.join(KKL_SCRIPTS, "source-catalog.mjs")).href);

  const parts = [];
  for (const f of ["seed.mjs", "curated-enrichment.mjs", "connectivity-expansion.mjs", "source-deepening.mjs"]) {
    const data = await loadImperativeData(f);
    parts.push({ file: f, ...data });
    console.log(`  ${f}: ${data.nodes.length} nodes, ${data.relationships.length} relationships`);
  }
  const cat = expandSourceCatalog(catalog.sourceCatalog, catalog.researchTasks);
  parts.push({ file: "source-catalog.mjs", ...cat });
  console.log(`  source-catalog.mjs: ${cat.nodes.length} nodes, ${cat.relationships.length} relationships`);

  // Merge + de-duplicate nodes by id (union props, later parts refine).
  const nodeById = new Map();
  for (const part of parts) {
    for (const n of part.nodes) {
      if (!n || !n.id) continue;
      const existing = nodeById.get(n.id);
      if (existing) {
        existing.props = { ...existing.props, ...(n.props || {}) };
      } else {
        nodeById.set(n.id, { label: n.label, id: n.id, props: { ...(n.props || {}) } });
      }
    }
  }
  const ids = new Set(nodeById.keys());

  // Merge + de-duplicate relationships by type|from|to; drop self-loops and
  // dangling endpoints so the snapshot passes the strict validator.
  const relByKey = new Map();
  let dropped = 0;
  for (const part of parts) {
    for (const r of part.relationships) {
      if (!r || !r.type || !r.from || !r.to) continue;
      if (r.from === r.to) { dropped++; continue; }
      if (!ids.has(r.from) || !ids.has(r.to)) { dropped++; continue; }
      const key = `${r.type}|${r.from}|${r.to}`;
      const { type, from, to, ...props } = r;
      if (relByKey.has(key)) {
        Object.assign(relByKey.get(key), props);
      } else {
        relByKey.set(key, { type, from, to, ...props });
      }
    }
  }

  const nodes = [...nodeById.values()];
  const relationships = [...relByKey.values()];

  const header =
    "// AUTO-GENERATED by scripts/consolidate-kartvelian.mjs — do not edit by hand.\n" +
    "// Full consolidated KartvelianKnowledgeLab dataset (seed + curated-enrichment\n" +
    "// + connectivity-expansion + source-deepening + source-catalog), baked into a\n" +
    "// self-contained snapshot so the unified graph has no sibling-repo dependency.\n\n";
  const body =
    `export const nodes = ${JSON.stringify(nodes, null, 2)};\n\n` +
    `export const relationships = ${JSON.stringify(relationships, null, 2)};\n`;
  await writeFile(OUT_FILE, header + body);
  await rm(TMP_DIR, { recursive: true, force: true });

  const labelCounts = {};
  for (const n of nodes) labelCounts[n.label] = (labelCounts[n.label] || 0) + 1;
  console.log(`\nConsolidated: ${nodes.length} nodes, ${relationships.length} relationships (${dropped} rels dropped: self-loop/dangling).`);
  console.log("Node labels:", JSON.stringify(labelCounts));
  console.log(`Snapshot written to ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
