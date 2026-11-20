import { describe, expect, it } from "vitest";
import path from "node:path";
import { DwgConversionError, configuredConverter, dwgToDxf, isDwg } from "../twin/dwg";
import { PlanInputError, readPlanUpload } from "../planReview";

const dwgBytes = (tag = "AC1032") => new Uint8Array([...new TextEncoder().encode(tag), 0, 0, 0, 0]);
const node = process.execPath;

describe("isDwg", () => {
  it.each(["AC1015", "AC1018", "AC1032"])("recognises %s", (tag) => expect(isDwg(dwgBytes(tag))).toBe(true));
  it("does not take a DXF, a PDF or an empty file for a DWG", () => {
    expect(isDwg(new TextEncoder().encode("  0\nSECTION\n"))).toBe(false);
    expect(isDwg(new TextEncoder().encode("%PDF-1.7"))).toBe(false);
    expect(isDwg(new Uint8Array())).toBe(false);
  });
});

describe("configuredConverter", () => {
  it("is off without DWG_CONVERTER", () => expect(configuredConverter({})).toBeNull());
  it("infers the kind from the program name or from DWG_CONVERTER_KIND", () => {
    expect(configuredConverter({ DWG_CONVERTER: "C:/ODA/ODAFileConverter.exe" })).not.toBeNull();
    expect(configuredConverter({ DWG_CONVERTER: "/usr/bin/dwg2dxf" })?.args("in.dwg", "i", "/o")).toEqual(["-y", "-o", path.join("/o", "out.dxf"), "in.dwg"]);
    expect(configuredConverter({ DWG_CONVERTER: "/opt/tool", DWG_CONVERTER_KIND: "oda" })?.args("f", "/in", "/out")).toEqual(["/in", "/out", "ACAD2018", "DXF", "0", "1", "*.dwg"]);
    expect(configuredConverter({ DWG_CONVERTER: "/opt/unknown-tool" })).toBeNull();
  });
});

describe("dwgToDxf", () => {
  // a stand-in converter: node runs the script with the output folder as its argument
  // (single quotes only: Windows mangles double quotes in command-line arguments)
  const fake = (script: string) => ({ command: node, args: (_f: string, _i: string, outDir: string) => ["-e", script, outDir] });

  it("returns the DXF the converter wrote", async () => {
    const out = await dwgToDxf(dwgBytes(), { converter: fake(`require('fs').writeFileSync(process.argv[1] + '/plan.dxf', 'EOF')`) });
    expect(new TextDecoder().decode(out)).toContain("EOF");
  });
  it("says not_configured when there is no converter", async () => {
    await expect(dwgToDxf(dwgBytes(), { converter: null })).rejects.toMatchObject({ code: "not_configured" });
  });
  it("reports a failing converter, no output and an empty output", async () => {
    await expect(dwgToDxf(dwgBytes(), { converter: fake(`process.exit(3)`) })).rejects.toMatchObject({ code: "failed" });
    await expect(dwgToDxf(dwgBytes(), { converter: fake(`0`) })).rejects.toMatchObject({ code: "failed" });
    await expect(dwgToDxf(dwgBytes(), { converter: fake(`require('fs').writeFileSync(process.argv[1] + '/x.dxf', '')`) })).rejects.toMatchObject({ code: "empty" });
  });
  it("gives up on a converter that hangs", async () => {
    await expect(dwgToDxf(dwgBytes(), { converter: fake(`setTimeout(()=>{}, 60000)`), timeoutMs: 400 })).rejects.toBeInstanceOf(DwgConversionError);
  });
});

describe("readPlanUpload", () => {
  it("passes a DXF through untouched", async () => {
    const dxf = new TextEncoder().encode("  0\nSECTION\n");
    expect(await readPlanUpload(dxf, "plan.dxf")).toEqual({ dxf, kind: "dxf" });
  });
  it("tells the developer to export a DXF when this server has no DWG converter", async () => {
    const saved = process.env.DWG_CONVERTER;
    delete process.env.DWG_CONVERTER;
    try {
      const err = await readPlanUpload(dwgBytes(), "plan.dwg").catch((e) => e);
      expect(err).toBeInstanceOf(PlanInputError);
      expect(err.status).toBe(501);
      expect(err.he).toMatch(/DXF/);
      expect(err.en).toMatch(/Save the plan as DXF/);
    } finally {
      if (saved !== undefined) process.env.DWG_CONVERTER = saved;
    }
  });
  it("rejects a .dwg name whose content is not a DWG", async () => {
    const err = await readPlanUpload(new TextEncoder().encode("not a dwg"), "plan.dwg").catch((e) => e);
    expect(err).toBeInstanceOf(PlanInputError);
    expect(err.status).toBe(422);
  });
});
