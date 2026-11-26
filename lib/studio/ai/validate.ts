/**
 * Server-side gate for AI-originated commands. Whatever a model (or the free dry-run
 * planner) returns is parsed with the strict command schema, restricted to the public
 * vocabulary, applied one by one to a working copy, and kept only if the result still
 * passes placement / proposal validation. Unknown assets, illegal sizes, locked nodes,
 * protected structure and wipe-everything commands never reach the client.
 */
import type { Baseline } from "../baseline/fromTwin";
import { apply, CommandError } from "../commands/apply";
import { CommandSchema, isPublicCommand, type Command } from "../commands/types";
import { previewNode, previewProposal } from "../design/preview";
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import { newNodeId } from "../schema/ids";
import type { DesignNode } from "../schema/nodes";

export const MAX_AI_COMMANDS = 60;
export const MAX_AI_ADDS = 40;
const FORBIDDEN = new Set(["restoreBaseline", "batch"]);

export type Rejection = { index: number; reason: string };
export type AiOutcome = { batch: Command | null; accepted: number; rejected: Rejection[]; doc: DesignDocument };

const idOf = (c: Command): string | null => ("id" in c && typeof c.id === "string" ? c.id : null);

/** Which node does this command leave behind for validation? */
function touched(c: Command): string | null {
  if (c.type === "add") return c.node.id;
  if (c.type === "remove" || c.type === "setSurfaceMaterial") return null;
  if (c.type === "duplicate") return c.newId;
  return idOf(c);
}

export function sanitizeAiCommands(raw: unknown, doc: DesignDocument, baseline: Baseline, catalog: CatalogLookup): AiOutcome {
  const rejected: Rejection[] = [];
  const accepted: Command[] = [];
  let working = doc;
  const remap = new Map<string, string>(); // ids invented by the model -> real ids
  let adds = 0;
  const list = Array.isArray(raw) ? raw.slice(0, MAX_AI_COMMANDS) : [];
  if (!Array.isArray(raw)) rejected.push({ index: -1, reason: "The response did not contain a list of commands." });
  if (Array.isArray(raw) && raw.length > MAX_AI_COMMANDS) rejected.push({ index: MAX_AI_COMMANDS, reason: `Only the first ${MAX_AI_COMMANDS} commands are considered.` });

  list.forEach((item, index) => {
    const parsed = CommandSchema.safeParse(item);
    if (!parsed.success) return void rejected.push({ index, reason: "Not a valid command." });
    let cmd = parsed.data;
    if (FORBIDDEN.has(cmd.type) || !isPublicCommand(cmd)) return void rejected.push({ index, reason: `The "${cmd.type}" command is not allowed here.` });
    // ids: models may invent ids for new nodes; real ids are assigned here and later references are rewritten
    if (cmd.type === "add") {
      if (adds >= MAX_AI_ADDS) return void rejected.push({ index, reason: "Too many new items in one proposal." });
      const fresh = newNodeId();
      remap.set(cmd.node.id, fresh);
      cmd = { ...cmd, node: { ...cmd.node, id: fresh } as DesignNode };
    } else if ("id" in cmd && typeof cmd.id === "string" && remap.has(cmd.id)) {
      cmd = { ...cmd, id: remap.get(cmd.id)! } as Command;
    }
    if (cmd.type === "remove" && doc.nodes[cmd.id] === undefined && !working.nodes[cmd.id]) return void rejected.push({ index, reason: "Nothing to remove." });
    try {
      const next = apply(working, cmd, { baseline, catalog }).doc;
      const id = touched(cmd);
      const node = id ? next.nodes[id] : undefined;
      if (node) {
        const p = node.kind === "item" ? previewNode(next, node, baseline, catalog) : node.kind === "partitionProposal" || node.kind === "openingProposal" ? previewProposal(next, node, baseline, catalog) : { ok: true, errors: [] as { message: string }[] };
        if (!p.ok) return void rejected.push({ index, reason: p.errors[0]?.message ?? "It does not fit there." });
      }
      working = next;
      accepted.push(cmd);
      if (cmd.type === "add") adds++;
    } catch (e) {
      if (e instanceof CommandError) return void rejected.push({ index, reason: e.message });
      throw e;
    }
  });
  return { batch: accepted.length ? { type: "batch", label: "AI designer", commands: accepted } : null, accepted: accepted.length, rejected, doc: working };
}
