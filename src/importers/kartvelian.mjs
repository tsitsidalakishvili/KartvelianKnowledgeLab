// Importer: KartvelianKnowledgeLab seed dataset -> unified records.
import { GRAPHSPACES, makeNode, makeRel } from "../lib/schema.mjs";
import { nodes as kklNodes, relationships as kklRels } from "../../data/kartvelian-seed.mjs";

const SOURCE = "KartvelianKnowledgeLab seed";
const GS = GRAPHSPACES.KARTVELIAN;

export function importKartvelian() {
  const nodes = kklNodes.map((n) =>
    makeNode({
      graphspace: GS,
      source: SOURCE,
      originalId: n.id,
      coreLabel: n.label,
      props: n.props,
    })
  );

  const relationships = kklRels
    .filter((r) => r.from !== r.to)
    .map((r) => {
      // Forward every relationship property except the structural keys the
      // schema helpers derive themselves (type/from/to).
      const { type, from, to, ...restProps } = r;
      return makeRel({
        graphspace: GS,
        source: SOURCE,
        type,
        from,
        to,
        props: {
          ...restProps,
          // KKL's in-graphspace SAME_AS links are editorially curated.
          ...(type === "SAME_AS" ? { method: "manual", status: "confirmed" } : {}),
        },
      });
    });

  return { graphspace: GS, nodes, relationships };
}
