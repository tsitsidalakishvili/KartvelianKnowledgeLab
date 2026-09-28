import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Exercise the exact Vercel entry point without database credentials.
test("Vercel handler serves the local pages and full snapshot API", async () => {
  for (const key of ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD", "NEO4J_DATABASE"]) delete process.env[key];
  const { default: handler } = await import("../api/index.mjs");
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [route, file] of [["/", "index.html"], ["/index.html", "index.html"], ["/families", "families.html"], ["/families.html", "families.html"]]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(new URL(`../app/${file}`, import.meta.url), "utf8"));
    }
    const graph = await (await fetch(base + "/api/graph")).json();
    const snapshot = JSON.parse(await readFile(new URL("../data/merged-graph.json", import.meta.url), "utf8"));
    assert.deepEqual(graph, { ...snapshot, source: "snapshot" });
    const stats = await (await fetch(base + "/api/stats")).json();
    assert.equal(stats.nodes, graph.nodes.length);
    assert.equal(stats.relationships, graph.relationships.length);
    const name = graph.nodes[0].props.name;
    const search = await (await fetch(base + "/api/search?q=" + encodeURIComponent(name))).json();
    assert(search.hits.some(n => n.uid === graph.nodes[0].uid));
    const edge = graph.relationships[0];
    const paths = await (await fetch(base + "/api/paths?" + new URLSearchParams({from: edge.from, to: edge.to}))).json();
    assert(paths.paths.length > 0);
    assert.equal((await fetch(base + "/api/paths")).status, 400);
    const families = await (await fetch(base + "/api/great-purge-families")).json();
    assert.deepEqual(families, JSON.parse(await readFile(new URL("../data/great-purge-families.json", import.meta.url), "utf8")));
    assert.equal((await fetch(base + "/missing")).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
