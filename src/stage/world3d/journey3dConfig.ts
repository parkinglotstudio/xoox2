/**
 * 3D 여정 뷰 튜닝 값 — 단일 출처.
 *
 * 이 값들은 코드 상수가 아니라 **데이터**다. 카메라 거리·시야·안개 같은 건
 * 눈으로 보며 맞춰야 하는 종류라서, 툴에서 조절해 저장하고 본편이 그걸 읽는다.
 *
 * 저장 경로: `data/ui/layout/journey3d_layout.json`
 * 편집: /layout-editor.html (씬 = journey3d) · /fpv-tool.html
 *
 * 저장은 Vite dev 미들웨어(`POST /__layout_save`)를 쓴다 — lobby_layout.json과 같은 길이다.
 * 즉 개발 중에만 저장되고, 빌드된 게임은 읽기만 한다.
 */

export type Journey3DTurnMode = "strafe" | "turn";
export type Journey3DViewMode = "tps" | "fps";

export interface Journey3DConfig {
  version: number;
  /**
   * 섹터 한 변을 몇 미터로 볼지.
   * 실측(sector_scale.json sector_world_w_m = 333)을 그대로 쓰면 2048px 구역 아트가
   * 발밑에서 뭉개져 색면이 된다. 노드·플레이어가 전부 % 좌표이므로 이 값은
   * **렌더 스케일**일 뿐이고 미니맵 동기화와 무관하다.
   */
  world_m: number;
  fov_deg: number;
  /** 캐릭터 키(m) — 노드·프롭·카메라 높이가 모두 이 값에 비례한다 */
  char_height_m: number;

  fog_vision_m: number;
  /** 시야 거리 대비 완전 안개 거리. 1이면 시야 끝에서 바로 닫힘 */
  fog_far_mul: number;
  fog_color: string;
  /** 오염 칸 — 안개(지평) */
  fog_color_polluted: string;
  /** 오염 칸 — 하늘 위 */
  fog_zenith_polluted: string;
  /** 정화 칸 — 안개(지평, 열린 시안) */
  fog_color_purified: string;
  /** 정화 칸 — 하늘 위 */
  fog_zenith_purified: string;

  move_speed_mps: number;
  /** 걷기(후진·좌우·총 든 이동) = 뛰기 속도 비율 */
  walk_speed_mul: number;
  turn_speed_deg: number;
  turn_mode: Journey3DTurnMode;
  view_mode: Journey3DViewMode;

  /** 3인칭 카메라 — 캐릭터 키 배수로 둔다(키를 바꿔도 구도가 유지된다) */
  tps_distance_mul: number;
  tps_height_mul: number;
  /** 캐릭터보다 얼마나 앞을 보는지 — 클수록 진행 방향이 넓게 보인다 */
  tps_look_ahead_mul: number;

  bob_amp_m: number;
  bob_hz: number;
  /** 1 미만이면 낮은 해상도로 그린 뒤 확대 — 둠 시절 픽셀감 */
  resolution_scale: number;
  approach_radius_m: number;

  /** 근거리 지면 타일 한 칸(m) · 질감 세기 0~1 */
  detail_tile_m: number;
  detail_strength: number;

  /** 노드 빌보드 높이 = char_height_m × 이 값 */
  node_height_mul: number;
  /** 임시 구조물 개수(노드 수와 무관한 하한) */
  prop_density: number;

  note?: string;
}

export const JOURNEY3D_CONFIG_URL = "/ui/layout/journey3d_layout.json";
export const JOURNEY3D_CONFIG_SAVE_PATH = "data/ui/layout/journey3d_layout.json";

/** fpv-tool에서 눈으로 맞춘 값 — JSON이 없거나 키가 빠져도 이 값으로 돌아간다 */
export const JOURNEY3D_DEFAULTS: Journey3DConfig = {
  version: 1,
  world_m: 70,
  fov_deg: 70,
  char_height_m: 1.7,
  fog_vision_m: 30,
  fog_far_mul: 1,
  fog_color: "#6a7f88",
  fog_color_polluted: "#6a7f88",
  fog_zenith_polluted: "#2e3d48",
  fog_color_purified: "#8eb0bc",
  fog_zenith_purified: "#5a98ac",
  move_speed_mps: 4.6,
  walk_speed_mul: 2 / 3,
  turn_speed_deg: 115,
  turn_mode: "turn",
  view_mode: "tps",
  tps_distance_mul: 2.6,
  tps_height_mul: 1.55,
  tps_look_ahead_mul: 2.2,
  bob_amp_m: 0.06,
  bob_hz: 2.1,
  resolution_scale: 1,
  approach_radius_m: 3.4,
  detail_tile_m: 2.5,
  detail_strength: 0.7,
  node_height_mul: 1.05,
  prop_density: 120,
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** 부분 JSON을 기본값 위에 얹는다 — 키가 빠져도 안전하게 뜬다 */
export function normalizeJourney3DConfig(raw: unknown): Journey3DConfig {
  const r = (raw ?? {}) as Partial<Record<keyof Journey3DConfig, unknown>>;
  const d = JOURNEY3D_DEFAULTS;
  return {
    version: num(r.version, d.version),
    world_m: num(r.world_m, d.world_m),
    fov_deg: num(r.fov_deg, d.fov_deg),
    char_height_m: num(r.char_height_m, d.char_height_m),
    fog_vision_m: num(r.fog_vision_m, d.fog_vision_m),
    fog_far_mul: num(r.fog_far_mul, d.fog_far_mul),
    fog_color: typeof r.fog_color === "string" ? r.fog_color : d.fog_color,
    fog_color_polluted:
      typeof r.fog_color_polluted === "string" ? r.fog_color_polluted : d.fog_color_polluted,
    fog_zenith_polluted:
      typeof r.fog_zenith_polluted === "string" ? r.fog_zenith_polluted : d.fog_zenith_polluted,
    fog_color_purified:
      typeof r.fog_color_purified === "string" ? r.fog_color_purified : d.fog_color_purified,
    fog_zenith_purified:
      typeof r.fog_zenith_purified === "string" ? r.fog_zenith_purified : d.fog_zenith_purified,
    move_speed_mps: num(r.move_speed_mps, d.move_speed_mps),
    walk_speed_mul: num(r.walk_speed_mul, d.walk_speed_mul),
    turn_speed_deg: num(r.turn_speed_deg, d.turn_speed_deg),
    turn_mode: r.turn_mode === "turn" ? "turn" : "strafe",
    view_mode: r.view_mode === "fps" ? "fps" : "tps",
    tps_distance_mul: num(r.tps_distance_mul, d.tps_distance_mul),
    tps_height_mul: num(r.tps_height_mul, d.tps_height_mul),
    tps_look_ahead_mul: num(r.tps_look_ahead_mul, d.tps_look_ahead_mul),
    bob_amp_m: num(r.bob_amp_m, d.bob_amp_m),
    bob_hz: num(r.bob_hz, d.bob_hz),
    resolution_scale: num(r.resolution_scale, d.resolution_scale),
    approach_radius_m: num(r.approach_radius_m, d.approach_radius_m),
    detail_tile_m: num(r.detail_tile_m, d.detail_tile_m),
    detail_strength: num(r.detail_strength, d.detail_strength),
    node_height_mul: num(r.node_height_mul, d.node_height_mul),
    prop_density: num(r.prop_density, d.prop_density),
    note: typeof r.note === "string" ? r.note : undefined,
  };
}

/** JSON이 없으면 기본값. 본편이 이걸로 부팅하므로 절대 던지지 않는다. */
export async function loadJourney3DConfig(): Promise<Journey3DConfig> {
  try {
    const res = await fetch(`${JOURNEY3D_CONFIG_URL}?t=${Date.now()}`);
    if (!res.ok) return { ...JOURNEY3D_DEFAULTS };
    return normalizeJourney3DConfig(await res.json());
  } catch {
    return { ...JOURNEY3D_DEFAULTS };
  }
}

export interface Journey3DSaveResult {
  ok: boolean;
  /** 서버 저장이 안 돼 파일로 내려받았는지 */
  downloaded: boolean;
  message: string;
}

/**
 * dev 서버에 저장. 실패하면 lobby_layout.json과 같은 방식으로 파일을 내려준다
 * (dev 서버 없이 열었을 때도 값을 잃지 않게).
 */
export async function saveJourney3DConfig(cfg: Journey3DConfig): Promise<Journey3DSaveResult> {
  const json: Journey3DConfig = {
    ...cfg,
    version: 1,
    note: "3D 여정 뷰 튜닝. 편집: /layout-editor.html(씬=journey3d) · /fpv-tool.html",
  };
  try {
    const res = await fetch("/__layout_save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: JOURNEY3D_CONFIG_SAVE_PATH, json }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string; path?: string };
    if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return { ok: true, downloaded: false, message: `저장됨 → ${body.path}` };
  } catch (e) {
    const blob = new Blob([JSON.stringify(json, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journey3d_layout.json";
    a.click();
    URL.revokeObjectURL(a.href);
    return {
      ok: false,
      downloaded: true,
      message: `서버 저장 실패 · JSON 내려받음 (${String(e)})`,
    };
  }
}
