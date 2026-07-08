// In-place migration for a reused AuraDB instance that already contains
// KartvelianKnowledgeLab records.
//
//   node --env-file=.env scripts/migrate-in-place.mjs
//   node --env-file=.env scripts/migrate-in-place.mjs --write

import { getDriver, getSession } from "../src/lib/neo4j.mjs";
import { GRAPHSPACES } from "../src/lib/schema.mjs";

const write = process.argv.includes("--write");
const KKL_LABELS = ["Person", "Place", "Event", "Document", "Inscription", "Institution", "Corpus"];

const driver = await getDriver();
const session = getSession(driver);

async function count(query, params = {}) {
  const res = await session.run(query, params);
  return res.records[0]?.get("c")?.toNumber?.() ?? Number(res.records[0]?.get("c") ?? 0);
}

try {
  for (const label of KKL_LABELS) {
    const c = await count(
      `MATCH (n:${label}) WHERE n.uid IS NULL AND n.id IS NOT NULL RETURN count(n) AS c`
    );
    if (!c) continue;
    console.log(`${write ? "Migrating" : "Would migrate"} ${c} legacy :${label} node(s) -> kartvelian graphspace`);
    if (write) {
      await session.run(
        `MATCH (n:${label}) WHERE n.uid IS NULL AND n.id IS NOT NULL
         SET n:Entity,
             n.uid = $gs + "/" + n.id,
             n.originalId = n.id,
             n.graphspace = $gs,
             n.source = coalesce(n.source, "KartvelianKnowledgeLab seed")`,
        { gs: GRAPHSPACES.KARTVELIAN }
      );
    }
  }

  const relCount = await count(
    `MATCH (a:Entity)-[r]->(:Entity) WHERE r.graphspace IS NULL AND a.graphspace = $gs RETURN count(r) AS c`,
    { gs: GRAPHSPACES.KARTVELIAN }
  );
  if (relCount) {
    console.log(`${write ? "Tagging" : "Would tag"} ${relCount} Kartvelian relationship(s) with provenance`);
    if (write) {
      await session.run(
        `MATCH (a:Entity)-[r]->(:Entity) WHERE r.graphspace IS NULL AND a.graphspace = $gs
         SET r.graphspace = $gs, r.source = coalesce(r.source, a.source)`,
        { gs: GRAPHSPACES.KARTVELIAN }
      );
    }
  }

  const remaining = await count(`MATCH (n) WHERE n.uid IS NULL RETURN count(n) AS c`);
  console.log(
    write
      ? `Migration complete. ${remaining} node(s) still without uid (unrelated data left untouched).`
      : `Dry run only. Rerun with --write to apply. ${remaining} node(s) currently without uid.`
  );
} finally {
  await session.close();
  await driver.close();
}