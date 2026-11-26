/**
 * /dev/admin/catalog: Design Studio catalog review for admins. Lists every manifest
 * (draft, review, published, retired) with its license, preview and audit result, and
 * lets an admin move it through the lifecycle on a dev machine. Publishing into the
 * studio still goes through `npm run studio:publish` (all gates run there).
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { auditAll, catalogWritable } from "@/lib/studio/catalog/adminFs";
import CatalogActions from "./CatalogActions";

export const dynamic = "force-dynamic";

export default async function CatalogAdminPage() {
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  let role: string | null = null;
  if (jwt) { try { role = verifyToken(jwt).role; } catch { role = null; } }
  if (role !== "admin") notFound();

  const { rows, invalid } = auditAll();
  const writable = catalogWritable();
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const models = rows.filter((r) => r.type === "model"), materials = rows.filter((r) => r.type === "material");

  const table = (list: typeof rows) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead><tr style={{ textAlign: "start", opacity: 0.7 }}><th></th><th>Id</th><th>v</th><th>Name</th><th>Category</th><th>Status</th><th>License</th><th>Audit</th><th></th></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={`${r.type}:${r.id}@${r.version}`} data-row={`${r.id}@${r.version}`} style={{ borderTop: "1px solid #ddd" }}>
            <td>{r.preview ? <img src={`/studio/catalog/${r.preview}`} alt="" width={44} height={44} style={{ borderRadius: 6 }} /> : null}</td>
            <td><code>{r.id}</code></td><td>{r.version}</td><td>{r.name}</td><td>{r.category}</td>
            <td data-status={r.status}>{r.status}</td>
            <td title={r.source}>{r.license}</td>
            <td>{r.issues.length ? <span style={{ color: "#b3261e" }}>{r.issues.join(" · ")}</span> : <span style={{ color: "#2e7d32" }}>ok</span>}
              {r.warnings.length ? <div style={{ color: "#8a6d00" }}>{r.warnings.join(" · ")}</div> : null}</td>
            <td><CatalogActions type={r.type} id={r.id} version={r.version} status={r.status} disabled={!writable} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main dir="ltr" style={{ maxWidth: 1200, margin: "32px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Design Studio catalog</h1>
      <p>{models.length} models · {materials.length} materials · published {count("published")} · review {count("review")} · draft {count("draft")} · retired {count("retired")}</p>
      <p style={{ opacity: 0.75 }}>
        Lifecycle: draft → review → published → retired. Published versions are immutable (change content = new version) and never deleted (designs pin them).
        After a change run <code>npm run studio:publish</code>: its gates (size, license, files, generator checks, immutability) decide what the studio sees.
        {writable ? "" : " Editing is disabled on this server (set STUDIO_CATALOG_WRITE=1 on a dev machine)."}
      </p>
      {invalid.length > 0 && <p style={{ color: "#b3261e" }}>Invalid manifests: {invalid.map((i) => `${i.file}: ${i.error}`).join(" | ")}</p>}
      <h2>Models</h2>{table(models)}
      <h2>Materials</h2>{table(materials)}
    </main>
  );
}
