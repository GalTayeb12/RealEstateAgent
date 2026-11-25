/**
 * Undo/redo over the command engine. Each entry stores the command and its
 * exact inverse, so undo is lossless; an AI proposal applied as one `batch`
 * is a single undo step.
 */
import { apply, type ApplyContext } from "./apply";
import type { Command } from "./types";
import type { DesignDocument } from "../schema/document";

type Entry = { redo: Command; undo: Command };

export class History {
  private past: Entry[] = [];
  private future: Entry[] = [];

  constructor(public doc: DesignDocument, private ctx: ApplyContext, private limit = 200) {}

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Applies a command (throws CommandError and leaves state untouched on failure). */
  do(cmd: Command): DesignDocument {
    const r = apply(this.doc, cmd, this.ctx);
    this.doc = r.doc;
    this.past.push({ redo: cmd, undo: r.inverse });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return this.doc;
  }

  undo(): DesignDocument {
    const e = this.past.pop();
    if (!e) return this.doc;
    this.doc = apply(this.doc, e.undo, this.ctx).doc;
    this.future.push(e);
    return this.doc;
  }

  redo(): DesignDocument {
    const e = this.future.pop();
    if (!e) return this.doc;
    this.doc = apply(this.doc, e.redo, this.ctx).doc;
    this.past.push(e);
    return this.doc;
  }
}
