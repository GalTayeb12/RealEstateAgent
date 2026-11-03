import fs from "fs";
import path from "path";

const skipDirs = new Set(["node_modules", ".next", "vision", "quiet"]);
const pairs = [
  ["#14130F", "#123F40"],
  ["#14130f", "#123F40"],
  ["#1A1916", "#E9EEEA"],
  ["#1A2A38", "#E9EEEA"],
  ["letterSpacing: \"-0.02em\"", "letterSpacing: \"0\""],
  ["letterSpacing: \"-0.01em\"", "letterSpacing: \"0\""],
  ["letterSpacing: \"-0.02em\"", "letterSpacing: \"0\""],
  ["fontWeight: 800", "fontWeight: 500"],
  ["fontWeight: 700", "fontWeight: 600"],
  ["#F7F5F1", "#F4F5F0"],
  ["#f7f5f1", "#F4F5F0"],
  ["#FAF8F4", "#F4F5F0"],
  ["#faf8f4", "#F4F5F0"],
  ["#1C1B19", "#123F40"],
  ["#1c1b19", "#123F40"],
  ["#6B6860", "#526563"],
  ["#6b6860", "#526563"],
  ["#9A958F", "#526563"],
  ["#9a958f", "#526563"],
  ["#2F6664", "#0C3031"],
  ["#2f6664", "#0C3031"],
  ["#1F4B4A", "#123F40"],
  ["#1f4b4a", "#123F40"],
  ["#E8F0EF", "#E9EEEA"],
  ["#e8f0ef", "#E9EEEA"],
  ["#C89B3C", "#756039"],
  ["#c89b3c", "#756039"],
  ["#B8892C", "#756039"],
  ["#b8892c", "#756039"],
  ["#FBF4E4", "#FCF2D9"],
  ["#fbf4e4", "#FCF2D9"],
  ["#B04040", "#9E3434"],
  ["#b04040", "#9E3434"],
  ["#FAE8E8", "#FBECEA"],
  ["#fae8e8", "#FBECEA"],
  ["#DDD9D3", "#D4DED8"],
  ["#ddd9d3", "#D4DED8"],
  ["#F0EDE8", "#E9EEEA"],
  ["#f0ede8", "#E9EEEA"],
  ["rgba(28, 27, 25", "rgba(18, 63, 64"],
  ["rgba(28,27,25", "rgba(18,63,64"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") || name.endsWith(".css")) out.push(p);
  }
  return out;
}

let n = 0;
for (const file of [...walk("app"), ...walk("components")]) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [a, b] of pairs) text = text.split(a).join(b);
  if (text !== before) {
    fs.writeFileSync(file, text);
    n += 1;
    console.log(file);
  }
}
console.log("files", n);
