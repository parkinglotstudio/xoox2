/**
 * Vite dev middleware (수스에서 가져옴, 저장 위치만 assets/susu 로 바꿈):
 * - POST /__layout_save  { path?, json } → data/ui/layout/*.json
 * - POST /__data_save     { path, text }  → data/*.csv (allowlist) · masks JSON
 * - POST /__play_log_save { file, text }  → data/dev_logs/play_*.txt
 * - POST /__play_log_wipe                 → play_*.txt 전부 삭제
 * - GET  /__play_log_list                 → 저장된 플레이 로그 목록
 */
import type { Plugin } from "vite";
import { writeFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { dirname, resolve } from "path";

const PLAY_LOG_FILE = /^play_\d{8}_\d{6}_\d{3}\.txt$/;

// Soos Arcade: 툴은 수스와 같은 "data/..." 경로를 보내지만, 실제 파일은 assets/susu/ 에 있다
const onDisk = (rel: string) => rel.replace(/^data\//, "assets/susu/");

function sendJson(res: import("http").ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function layoutSavePlugin(): Plugin {
  return {
    name: "xoox-layout-save",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];

        if (url === "/__play_log_list" && req.method === "GET") {
          try {
            const dir = resolve(server.config.root, onDisk("data/dev_logs"));
            await mkdir(dir, { recursive: true });
            const names = (await readdir(dir)).filter((n) => PLAY_LOG_FILE.test(n)).sort().reverse();
            const files: { file: string; chars: number; mtime: string }[] = [];
            for (const name of names) {
              const st = await stat(resolve(dir, name));
              files.push({
                file: name,
                chars: st.size,
                mtime: st.mtime.toISOString(),
              });
            }
            sendJson(res, 200, { ok: true, files });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return;
        }

        if (req.method !== "POST") {
          next();
          return;
        }

        if (url === "/__layout_save") {
          try {
            const body = JSON.parse(await readBody(req)) as { path?: string; json: unknown };
            const rel = (body.path || "data/ui/layout/lobby_layout.json").replace(/^\/+/, "");
            if (!rel.startsWith("data/ui/layout/") || rel.includes("..")) {
              sendJson(res, 400, { ok: false, error: "path not allowed" });
              return;
            }
            const abs = resolve(server.config.root, onDisk(rel));
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, JSON.stringify(body.json, null, 2) + "\n", "utf8");
            sendJson(res, 200, { ok: true, path: rel });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return;
        }

        if (url === "/__data_save") {
          try {
            const body = JSON.parse(await readBody(req)) as { path?: string; text?: string };
            const rel = (body.path || "").replace(/^\/+/, "");
            const allowed =
              rel === "data/area_npc_config.csv" ||
              rel === "data/area_prop_config.csv" ||
              (rel.startsWith("data/ui/layout/") && rel.endsWith(".json")) ||
              (rel.startsWith("data/map_mask_tool/masks/") && rel.endsWith(".json")) ||
              (rel.startsWith("data/map_mask_tool/master/") && rel.endsWith(".json"));
            if (!allowed || rel.includes("..") || typeof body.text !== "string") {
              sendJson(res, 400, { ok: false, error: "path not allowed" });
              return;
            }
            if (
              (rel.startsWith("data/map_mask_tool/masks/") || rel.startsWith("data/map_mask_tool/master/")) &&
              body.text.length > 40_000_000
            ) {
              sendJson(res, 400, { ok: false, error: "mask too large" });
              return;
            }
            const abs = resolve(server.config.root, onDisk(rel));
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, body.text, "utf8");
            sendJson(res, 200, { ok: true, path: rel });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return;
        }

        if (url === "/__play_log_save") {
          try {
            const body = JSON.parse(await readBody(req)) as { file?: string; text?: string };
            const name = (body.file || "").replace(/^.*[/\\]/, "");
            if (!PLAY_LOG_FILE.test(name) || typeof body.text !== "string") {
              sendJson(res, 400, { ok: false, error: "file not allowed" });
              return;
            }
            if (body.text.length > 200_000) {
              sendJson(res, 400, { ok: false, error: "too large" });
              return;
            }
            const rel = `data/dev_logs/${name}`;
            const abs = resolve(server.config.root, onDisk(rel));
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, body.text, "utf8");
            sendJson(res, 200, { ok: true, path: rel });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return;
        }

        if (url === "/__play_log_wipe") {
          try {
            const dir = resolve(server.config.root, onDisk("data/dev_logs"));
            await mkdir(dir, { recursive: true });
            const names = (await readdir(dir)).filter((n) => PLAY_LOG_FILE.test(n));
            for (const name of names) {
              await unlink(resolve(dir, name));
            }
            sendJson(res, 200, { ok: true, removed: names.length });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return;
        }

        next();
      });
    },
  };
}
