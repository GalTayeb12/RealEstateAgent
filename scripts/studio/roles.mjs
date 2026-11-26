// True when STUDIO_ROLES=* (every signed-in role may use the studio): environment first, then .env.local / .env.
// The role-gate checks in the e2e scripts then expect a buyer to be let in (only anonymous visitors are refused).
import fs from "node:fs";

export const rolesOpen = (() => {
  let v = process.env.STUDIO_ROLES;
  for (const f of [".env.local", ".env"]) {
    if (v || !fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^STUDIO_ROLES\s*=\s*"?([^"\r\n]*)"?/m);
    if (m) v = m[1];
  }
  return (v ?? "").split(",").map((x) => x.trim()).includes("*");
})();
