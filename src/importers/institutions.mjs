// Importer: institutional attribution for the Kartvelian resource base.
//
// The 13 catalogued research sources (corpora, epigraphy, prosopography,
// manuscripts, NLP tools) are digital resources created and maintained by the
// Institute of Linguistic Studies of Ilia State University (Tbilisi, Georgia),
// hosted under iliauni.edu.ge. This importer adds the academic credit as graph
// entities: each Source is CREATED_BY the Institute, which is PART_OF the
// University. It attaches to the Source nodes produced by the kartvelian
// importer (same graphspace + originalIds), so run it alongside that one.
//
// Attribution basis:
//   - Ilia State University, Institute of Linguistic Studies
//     (ენობრივი კვლევების ინსტიტუტი): https://research.iliauni.edu.ge/en/institution/19-lingvistur-kvlevata-instituti
//   - Georgian Language Corpus, a project of the Institute of Linguistic
//     Studies (2009–2016), developed with support of Ilia State University and
//     the Shota Rustaveli National Science Foundation of Georgia.

import { GRAPHSPACES, makeNode, makeRel } from "../lib/schema.mjs";

const GS = GRAPHSPACES.KARTVELIAN;
const SOURCE = "Ilia State University attribution";

const UNIVERSITY_ID = "institution:ilia-state-university";
const INSTITUTE_ID = "institution:ils-iliauni";

// Every catalogued source id, with an optional provenance note where the
// creator relationship needs nuance.
const SOURCE_IDS = [
  { id: "source:glc" },
  { id: "source:xmf" },
  { id: "source:childes" },
  { id: "source:tobit" },
  { id: "source:epigraphy" },
  { id: "source:wardrop" },
  { id: "source:ogb" },
  { id: "source:prosopography-georgia" },
  { id: "source:missio" },
  { id: "source:idioms" },
  { id: "source:gesl" },
  { id: "source:morphology" },
  {
    id: "source:ud-georgian",
    note: "Built from the Georgian Language Corpus (Ilia State University); distributed via Universal Dependencies.",
  },
];

export function importInstitutions() {
  const nodes = [
    makeNode({
      graphspace: GS,
      source: SOURCE,
      originalId: UNIVERSITY_ID,
      coreLabel: "Institution",
      props: {
        name: "Ilia State University",
        localName: "ილიას სახელმწიფო უნივერსიტეტი",
        abbreviation: "ISU",
        description:
          "Public research university in Tbilisi, Georgia, founded in 2006 from the merger of six academic institutions. Creator and host of the Kartvelian digital resource base used by this product.",
        url: "https://iliauni.edu.ge/en/",
        city: "Tbilisi",
        country: "Georgia",
        founded: 2006,
      },
    }),
    makeNode({
      graphspace: GS,
      source: SOURCE,
      originalId: INSTITUTE_ID,
      coreLabel: "Institution",
      props: {
        name: "Institute of Linguistic Studies, Ilia State University",
        localName: "ენობრივი კვლევების ინსტიტუტი",
        description:
          "Research institute of Ilia State University that develops and maintains the Georgian Language Corpus and the wider Kartvelian corpus, epigraphy, prosopography, manuscript, lexical, and NLP resources catalogued by this product.",
        url: "https://research.iliauni.edu.ge/en/institution/19-lingvistur-kvlevata-instituti",
        institutionKind: "ResearchInstitute",
      },
    }),
  ];

  const relationships = [
    makeRel({
      graphspace: GS,
      source: SOURCE,
      type: "PART_OF",
      from: INSTITUTE_ID,
      to: UNIVERSITY_ID,
    }),
    ...SOURCE_IDS.map(({ id, note }) =>
      makeRel({
        graphspace: GS,
        source: SOURCE,
        type: "CREATED_BY",
        from: id,
        to: INSTITUTE_ID,
        props: note ? { note } : {},
      })
    ),
  ];

  return { graphspace: GS, nodes, relationships };
}
