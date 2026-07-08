// Canonical schema helpers for the Kartvelian Knowledge Universe MVP.

export const GRAPHSPACES = {
  KARTVELIAN: "kartvelian",
};

export const CORE_LABELS = new Set([
  "Person",
  "Place",
  "Event",
  "Document",
  "Inscription",
  "Institution",
  "Corpus",
  "Family",
  "Theme",
  "Motif",
  "NarrativeVoice",
  "Evidence",
  "Source",
  "DatasetRecord",
  "ResearchTask",
  "Period",
  "Script",
  "Language",
  "Title",
  "NameVariant",
  "Lemma",
  "ManuscriptWitness",
  "TextMention",
]);

export const MODIFIER_LABELS = new Set([]);

export function makeUid(graphspace, originalId) {
  return `${graphspace}/${originalId}`;
}

export function makeNode({ graphspace, source, originalId, coreLabel, modifiers = [], props = {} }) {
  if (!CORE_LABELS.has(coreLabel)) {
    throw new Error(`Unknown core label "${coreLabel}" for node ${originalId}`);
  }
  for (const modifier of modifiers) {
    if (!MODIFIER_LABELS.has(modifier)) throw new Error(`Unknown modifier label "${modifier}"`);
  }
  const uid = makeUid(graphspace, originalId);
  return {
    uid,
    labels: ["Entity", coreLabel, ...modifiers],
    props: {
      ...props,
      uid,
      originalId,
      graphspace,
      source,
    },
  };
}

export function makeRel({ graphspace, source, originalId = null, type, from, to, props = {} }) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(type)) {
    throw new Error(`Invalid relationship type "${type}"`);
  }
  return {
    uid: originalId ? makeUid(graphspace, originalId) : makeUid(graphspace, `${type}:${from}->${to}`),
    type,
    from: makeUid(graphspace, from),
    to: makeUid(graphspace, to),
    props: {
      ...props,
      graphspace,
      source,
    },
  };
}