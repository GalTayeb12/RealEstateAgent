/**
 * DWG input. DWG is Autodesk's closed binary format, and most architects work
 * in it, so developers will upload it. We do not read it ourselves: it is
 * converted to DXF by an external converter run as a separate process, and the
 * DXF goes through the normal parser (lib/twin/dxf/parse.ts).
 *
 * Configure one converter on the machine that handles uploads:
 *
 *   DWG_CONVERTER=C:/Program Files/ODA/ODAFileConverter 26.x/ODAFileConverter.exe
 *       ODA File Converter: free to use, proprietary licence (do not redistribute it)
 *   DWG_CONVERTER=C:/tools/libredwg/dwg2dxf.exe
 *       LibreDWG's dwg2dxf: GPL-3.0; as a separate process that does not
 *       affect the licence of this code, but its output can be less complete
 *
 * The kind is inferred from the file name ("ODAFileConverter" → oda, "dwg2dxf"
 * → libredwg) or set with DWG_CONVERTER_KIND=oda|libredwg.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type DwgErrorCode = "not_configured" | "failed" | "timeout" | "empty";

export class DwgConversionError extends Error {
  constructor(public readonly code: DwgErrorCode, message: string) {
    super(message);
  }
}

/** Command line of a converter: what to run, given the input file and an output folder. */
export interface DwgConverter {
  command: string;
  args: (inFile: string, inDir: string, outDir: string) => string[];
}

/** "AC1015", "AC1032", …: the version tag every DWG starts with. */
export function isDwg(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const tag = String.fromCharCode(...bytes.subarray(0, 6));
  return /^AC10\d\d$/.test(tag);
}

/** The converter named in the environment, or null when none is set. */
export function configuredConverter(env: Record<string, string | undefined> = process.env): DwgConverter | null {
  const command = env.DWG_CONVERTER?.trim();
  if (!command) return null;
  const kind = (env.DWG_CONVERTER_KIND ?? (/oda/i.test(path.basename(command)) ? "oda" : /dwg2dxf/i.test(path.basename(command)) ? "libredwg" : "")).toLowerCase();
  if (kind === "oda") {
    // ODAFileConverter <in dir> <out dir> <out version> <out type> <recurse> <audit> [filter]
    return { command, args: (_f, inDir, outDir) => [inDir, outDir, "ACAD2018", "DXF", "0", "1", "*.dwg"] };
  }
  if (kind === "libredwg") {
    return { command, args: (inFile, _d, outDir) => ["-y", "-o", path.join(outDir, "out.dxf"), inFile] };
  }
  return null;
}

export const dwgConverterAvailable = (env: Record<string, string | undefined> = process.env) => configuredConverter(env) !== null;

/** Convert DWG bytes to DXF bytes with the given (or configured) converter. */
export async function dwgToDxf(bytes: Uint8Array, opts: { converter?: DwgConverter | null; timeoutMs?: number } = {}): Promise<Uint8Array> {
  const converter = opts.converter === undefined ? configuredConverter() : opts.converter;
  if (!converter) throw new DwgConversionError("not_configured", "No DWG converter is configured (DWG_CONVERTER)");
  const dir = await mkdtemp(path.join(tmpdir(), "haveniq-dwg-"));
  const inDir = path.join(dir, "in"), outDir = path.join(dir, "out");
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(inDir); await mkdir(outDir);
    const inFile = path.join(inDir, "plan.dwg");
    await writeFile(inFile, bytes);
    await new Promise<void>((resolve, reject) => {
      execFile(converter.command, converter.args(inFile, inDir, outDir), { timeout: opts.timeoutMs ?? 120_000, windowsHide: true }, (err) => {
        if (!err) return resolve();
        const timedOut = (err as NodeJS.ErrnoException & { killed?: boolean }).killed;
        reject(new DwgConversionError(timedOut ? "timeout" : "failed", `DWG converter failed: ${err.message.slice(0, 200)}`));
      });
    });
    const out = (await readdir(outDir)).find((f) => /\.dxf$/i.test(f));
    if (!out) throw new DwgConversionError("failed", "The DWG converter produced no DXF file");
    const dxf = await readFile(path.join(outDir, out));
    if (dxf.length === 0) throw new DwgConversionError("empty", "The DWG converter produced an empty DXF file");
    return new Uint8Array(dxf);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
