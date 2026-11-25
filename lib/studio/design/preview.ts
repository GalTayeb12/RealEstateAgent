/**
 * Live validation for drags and "add" previews: would this node, placed like
 * this, be accepted? Only issues that involve the node itself are returned.
 */
import type { Baseline } from "../baseline/fromTwin";
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { DesignNode, ItemNode } from "../schema/nodes";
import { validateProposals } from "../validation/architecture";
import { advisoriesOf, errorsOf, validateDocument, type Issue, type ValidationOptions } from "../validation/placement";

export type Preview = { errors: Issue[]; advisories: Issue[]; ok: boolean };

export function previewNode(
  doc: DesignDocument, node: ItemNode, baseline: Baseline, catalog: CatalogLookup, options?: ValidationOptions,
): Preview {
  const next: DesignDocument = { ...doc, nodes: { ...doc.nodes, [node.id]: node } };
  const mine = validateDocument(next, baseline, catalog, options).filter((i) => i.nodeId === node.id || i.otherId === node.id);
  const errors = errorsOf(mine);
  return { errors, advisories: advisoriesOf(mine), ok: errors.length === 0 };
}

/** Same for a proposal node (partition or opening): the issues that involve it, in the document with it applied. */
export function previewProposal(doc: DesignDocument, node: DesignNode, baseline: Baseline, catalog: CatalogLookup): Preview {
  const next: DesignDocument = { ...doc, nodes: { ...doc.nodes, [node.id]: node } };
  const mine = validateProposals(next, baseline, catalog).filter((i) => i.nodeId === node.id || i.otherId === node.id);
  const errors = errorsOf(mine);
  return { errors, advisories: advisoriesOf(mine), ok: errors.length === 0 };
}

export function withTransform(node: ItemNode, t: Partial<ItemNode["transform"]>): ItemNode {
  return { ...node, transform: { ...node.transform, ...t } };
}
