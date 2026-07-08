// SAME_AS / DEPICTS candidate generation across graphspaces.
//
//   node scripts/link-entities.mjs
//
// Compares entities of compatible core labels across different graphspaces
// and writes reviewable candidates to data/same-as-candidates.json.
// Candidates are NEVER auto-written to Neo4j: a human confirms them first
// (this file is the input for the future entity-linking review workbench).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMergedGraph } from "./ingest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "..", "data", "same-as-candidates.json");

// Which label pairs are comparable, and which relationship a confirmed match becomes.
// Fictional->real matches become DEPICTS; real->real become SAME_AS.
const COMPARABLE = ["Person", "Place", "Event", "Document", "Family", "Institution"];

function normalize(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenJaccard(a, b) {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function scorePair(a, b) {
  const reasons = [];
  let score = 0;

  const nameSim = Math.max(
    tokenJaccard(a.props.name, b.props.name),
    ...(a.props.aliases || []).map((al) => tokenJaccard(al, b.props.name)),
    ...(b.props.aliases || []).map((al) => tokenJaccard(a.props.name, al))
  );
  if (nameSim > 0) {
    score += nameSim * 0.7;
    reasons.push(`name similarity ${nameSim.toFixed(2)}`);
  }

  // Geographic proximity for places
  if (a.props.lat != null && b.props.lat != null) {
    const km = haversineKm(a.props, b.props);
    if (km < 25) {
      score += 0.3;
      reasons.push(`coordinates within ${km.toFixed(1)} km`);
    }
  }

  // Temporal overlap for events
  const aStart = a.props.year ?? a.props.dateStart;
  const bStart = b.props.year ?? b.props.dateStart;
  if (aStart != null && bStart != null && Math.abs(aStart - bStart) <= 25) {
    score += 0.15;
    reasons.push(`dates within 25y (${aStart} / ${bStart})`);
  }

  return { score: Math.min(score, 1), reasons };
}

const THRESHOLD = 0.35;

const graph = buildMergedGraph();
const byLabel = new Map();
for (const n of graph.nodes) {
  const core = n.labels[1];
  if (!COMPARABLE.includes(core)) continue;
  if (!byLabel.has(core)) byLabel.set(core, []);
  byLabel.get(core).push(n);
}

const candidates = [];
for (const [label, nodes] of byLabel) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.props.graphspace === b.props.graphspace) continue; // in-space links are curated upstream
      const { score, reasons } = scorePair(a, b);
      if (score < THRESHOLD) continue;
      const fictionInvolved = a.labels.includes("Fictional") || b.labels.includes("Fictional");
      candidates.push({
        proposedType: fictionInvolved ? "DEPICTS" : "SAME_AS",
        label,
        from: { uid: a.uid, name: a.props.name, graphspace: a.props.graphspace },
        to: { uid: b.uid, name: b.props.name, graphspace: b.props.graphspace },
        score: Number(score.toFixed(3)),
        reasons,
        method: "candidate-nameMatch-v1",
        status: "candidate",
      });
    }
  }
}

candidates.sort((x, y) => y.score - x.score);

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), threshold: THRESHOLD, candidates }, null, 2));

console.log(`${candidates.length} cross-graphspace link candidate(s) -> ${path.relative(process.cwd(), OUT_FILE)}`);
for (const c of candidates.slice(0, 15)) {
  console.log(`  [${c.score}] ${c.from.name} (${c.from.graphspace}) -${c.proposedType}-> ${c.to.name} (${c.to.graphspace}) — ${c.reasons.join("; ")}`);
}
