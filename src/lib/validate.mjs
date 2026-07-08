// Structural integrity checks for the merged graph (pre-write gate).
import { CORE_LABELS, MODIFIER_LABELS } from "./schema.mjs";

export function validateMerged({ nodes, relationships }) {
  const problems = [];
  const uids = new Set();

  for (const n of nodes) {
    if (uids.has(n.uid)) problems.push(`Duplicate node uid: ${n.uid}`);
    uids.add(n.uid);

    if (n.labels[0] !== "Entity") problems.push(`${n.uid}: first label must be Entity`);
    if (!CORE_LABELS.has(n.labels[1])) problems.push(`${n.uid}: missing/unknown core label "${n.labels[1]}"`);
    for (const extra of n.labels.slice(2)) {
      if (!MODIFIER_LABELS.has(extra)) problems.push(`${n.uid}: unknown modifier label "${extra}"`);
    }
    if (!n.props.graphspace) problems.push(`${n.uid}: missing graphspace`);
    if (!n.props.source) problems.push(`${n.uid}: missing source`);
    if (!n.props.name) problems.push(`${n.uid}: missing name`);
  }

  const relUids = new Set();
  for (const r of relationships) {
    if (relUids.has(r.uid)) problems.push(`Duplicate relationship uid: ${r.uid}`);
    relUids.add(r.uid);
    if (!uids.has(r.from)) problems.push(`${r.uid}: dangling endpoint ${r.from}`);
    if (!uids.has(r.to)) problems.push(`${r.uid}: dangling endpoint ${r.to}`);
    if (r.from === r.to) problems.push(`${r.uid}: self-loop`);
    if (!r.props.graphspace) problems.push(`${r.uid}: missing graphspace`);
  }

  return problems;
}
