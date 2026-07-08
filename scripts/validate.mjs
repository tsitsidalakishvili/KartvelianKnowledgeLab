// Standalone validation: build the merged graph in memory and report problems.
import { buildMergedGraph } from "./ingest.mjs";
import { validateMerged } from "../src/lib/validate.mjs";

const graph = buildMergedGraph();
const problems = validateMerged(graph);

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error(" -", p);
  process.exit(1);
}
console.log(
  `OK: ${graph.nodes.length} nodes / ${graph.relationships.length} relationships across ${Object.keys(graph.perSpace).length} graphspaces.`
);
