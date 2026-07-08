// Unified Graph MVP server — zero external dependencies.
//
//   npm run mvp        (rebuilds the merged snapshot, then serves the explorer)
//   http://localhost:3020
//
// Data source: data/merged-graph.json (offline snapshot). If NEO4J_* env vars
// are set, /api/graph refreshes from AuraDB instead (same shape).

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasCredentials } from "../src/lib/neo4j.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3020);

async function loadSnapshot() {
  return JSON.parse(await readFile(path.join(ROOT, "data", "merged-graph.json"), "utf8"));
}

async function loadFromNeo4j() {
  const { getDriver, getSession } = await import("../src/lib/neo4j.mjs");
  const driver = await getDriver();
  const session = getSession(driver);
  try {
    const nodesRes = await session.run(
      `MATCH (n:Entity) WHERE coalesce(n.graphspace, "kartvelian") = "kartvelian" RETURN n.uid AS uid, labels(n) AS labels, properties(n) AS props`
    );
    const relsRes = await session.run(
      `MATCH (a:Entity)-[r]->(b:Entity)
       WHERE coalesce(a.graphspace, "kartvelian") = "kartvelian" AND coalesce(b.graphspace, "kartvelian") = "kartvelian"
       RETURN coalesce(r.uid, elementId(r)) AS uid, type(r) AS type, a.uid AS from, b.uid AS to, properties(r) AS props`
    );
    return {
      nodes: nodesRes.records.map((rec) => ({
        uid: rec.get("uid"),
        labels: rec.get("labels").filter((l) => l !== "LegacyNode"),
        props: rec.get("props"),
      })),
      relationships: relsRes.records.map((rec) => ({
        uid: rec.get("uid"),
        type: rec.get("type"),
        from: rec.get("from"),
        to: rec.get("to"),
        props: rec.get("props"),
      })),
      source: "auradb",
    };
  } finally {
    await session.close();
    await driver.close();
  }
}

let cache = null;
async function getGraph() {
  if (!cache) {
    cache = hasCredentials()
      ? await loadFromNeo4j().catch(async (e) => {
          console.warn("Neo4j unavailable, using snapshot:", e.message);
          return { ...(await loadSnapshot()), source: "snapshot" };
        })
      : { ...(await loadSnapshot()), source: "snapshot" };
  }
  return cache;
}

// Grounded evidence paths: BFS (undirected) collecting up to `limit` shortest paths.
function findPaths(graph, fromUid, toUid, limit = 3, maxDepth = 6) {
  const adj = new Map();
  for (const r of graph.relationships) {
    if (!adj.has(r.from)) adj.set(r.from, []);
    if (!adj.has(r.to)) adj.set(r.to, []);
    adj.get(r.from).push({ rel: r, next: r.to, direction: "out" });
    adj.get(r.to).push({ rel: r, next: r.from, direction: "in" });
  }
  const nodesByUid = new Map(graph.nodes.map((n) => [n.uid, n]));
  const results = [];
  const queue = [[fromUid, [], new Set([fromUid])]];
  let shortest = Infinity;

  while (queue.length && results.length < limit) {
    const [current, trail, visited] = queue.shift();
    if (trail.length > Math.min(maxDepth, shortest)) break;
    if (current === toUid && trail.length) {
      shortest = Math.min(shortest, trail.length);
      results.push({
        length: trail.length,
        steps: trail.map((s) => ({
          from: pickNode(nodesByUid.get(s.direction === "out" ? s.rel.from : s.rel.to)),
          type: s.rel.type,
          relUid: s.rel.uid,
          direction: s.direction,
          to: pickNode(nodesByUid.get(s.direction === "out" ? s.rel.to : s.rel.from)),
          provenance: {
            graphspace: s.rel.props?.graphspace,
            source: s.rel.props?.source,
            certainty: s.rel.props?.certainty,
            summary: s.rel.props?.summary,
            evidenceRefs: s.rel.props?.evidenceRefs || [],
          },
        })),
      });
      continue;
    }
    for (const edge of adj.get(current) || []) {
      if (visited.has(edge.next)) continue;
      queue.push([edge.next, [...trail, edge], new Set([...visited, edge.next])]);
    }
  }
  return results;
}

function pickNode(n) {
  if (!n) return null;
  return { uid: n.uid, name: n.props?.name, labels: n.labels, graphspace: n.props?.graphspace };
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await readFile(path.join(ROOT, "app", "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (url.pathname === "/api/graph") {
      return json(res, 200, await getGraph());
    }
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const graph = await getGraph();
      const hits = graph.nodes
        .filter((n) => (n.props?.name || "").toLowerCase().includes(q) || (n.props?.description || "").toLowerCase().includes(q))
        .slice(0, 25)
        .map(pickNode);
      return json(res, 200, { query: q, hits });
    }
    if (url.pathname === "/api/paths") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) return json(res, 400, { error: "from and to uid params required" });
      const graph = await getGraph();
      const paths = findPaths(graph, from, to);
      return json(res, 200, {
        from, to, paths,
        note: paths.length
          ? "Every step carries graphspace/source provenance — grounded evidence only."
          : "No path found in the merged graph.",
      });
    }
    if (url.pathname === "/api/stats") {
      const graph = await getGraph();
      const bySpace = {};
      for (const n of graph.nodes) {
        const gs = n.props?.graphspace || "unknown";
        bySpace[gs] = (bySpace[gs] || 0) + 1;
      }
      return json(res, 200, {
        dataSource: graph.source,
        nodes: graph.nodes.length,
        relationships: graph.relationships.length,
        nodesByGraphspace: bySpace,
      });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  const mode = hasCredentials() ? "AuraDB" : "local snapshot";
  console.log(`Kartvelian Graph MVP: http://localhost:${PORT} (data: ${mode})`);
});
