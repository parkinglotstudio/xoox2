// 리소스 뷰어용 파일 목록 → assets/susu/_index.json (웹에서 /_index.json)
//   assets/susu 안 파일은 /… (수스 웹 루트 그대로), assets/maps 안 파일은 /assets/maps/… 로 적는다.
// 리소스를 새로 복사하거나 맵을 새로 구우면 다시 실행한다.
//   node scripts/build-asset-index.mjs
import { readdirSync, statSync, writeFileSync, existsSync } from "fs";
import { join, relative, extname } from "path";

const PROJECT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const KEEP = new Set([".glb", ".gltf", ".png", ".jpg", ".jpeg", ".webp", ".json"]);
const ROOTS = [
  { dir: join(PROJECT, "assets/susu"), prefix: "/" },
  { dir: join(PROJECT, "assets/maps"), prefix: "/assets/maps/" },
];
const files = [];
for (const { dir, prefix } of ROOTS) {
  if (!existsSync(dir)) continue;
  (function walk(d) {
    for (const name of readdirSync(d)) {
      if (name.startsWith("_index")) continue;
      const abs = join(d, name), st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (KEEP.has(extname(name).toLowerCase())) files.push({ p: prefix + relative(dir, abs).replace(/\\/g, "/"), kb: Math.round(st.size / 1024) });
    }
  })(dir);
}
files.sort((a, b) => a.p.localeCompare(b.p));
writeFileSync(join(PROJECT, "assets/susu/_index.json"), JSON.stringify({ made: new Date().toISOString(), files }));
console.log(`files ${files.length}`);
