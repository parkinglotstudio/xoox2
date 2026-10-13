import { MapView } from "./BlockMapView";
import * as THREE from "three";
export type BlockMapState = "purified" | "polluted";
export type BlockMapSector = "i21" | "i11";
export interface BlockMapStand {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export interface BlockMapBackdrop {
  radius: number;
  height: number;
  footY: number;
}
export interface BlockMapManifest {
  schemaVersion: number;
  revision: string;
  defaultSector: BlockMapSector;
  defaultState: BlockMapState;
  grassFarMeters: number;
  sectorMeters?: number;
  personMeters?: number;
  terrainBlockMeters?: number;
  backdrop?: BlockMapBackdrop;
  actors: { person: string; monster: string };
  states: Record<BlockMapState, {
    label: string; backdrop: string; sky: string; fog: string; hemi: number; sun: number;
    fogNear?: number; fogFar?: number;
  }>;
  sectors: Record<BlockMapSector, {
    label: string; purified: string; polluted: string; stand?: BlockMapStand;
    cameras: Record<string, {label: string; pos: [number, number, number]; target: [number, number, number]}>;
  }>;
}
const DEFAULT_STAND: BlockMapStand = { x: 55, y: 55, z: 0, yaw: Math.PI * 0.9 };
const DEFAULT_BACKDROP: BlockMapBackdrop = { radius: 420, height: 360, footY: 255 };
/** 맵 GLB·원경이 같은 revision 을 쓴다. */
export function blockAssetUrl(path: string, revision: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}rev=${encodeURIComponent(revision)}`;
}
export const BLOCK_MAP_MANIFEST = "/maps/block/manifest.json";
export async function readBlockMapManifest(): Promise<BlockMapManifest> {
  const response = await fetch(BLOCK_MAP_MANIFEST, {cache: "no-store"});
  if (!response.ok) throw new Error(`맵 목록 로드 실패 (${response.status})`);
  const manifest = await response.json() as BlockMapManifest;
  if (manifest.schemaVersion !== 1 || !manifest.sectors?.i21 || !manifest.states?.purified) throw new Error("지원하지 않는 맵 목록");
  return manifest;
}
/** Every tool uses this entry point. Publish the manifest only after all versioned assets exist. */
export async function loadBlockMap(options: {sector?: BlockMapSector; state?: BlockMapState; actors?: boolean; person?: boolean} = {}) {
  const manifest = await readBlockMapManifest();
  const sector = options.sector ?? manifest.defaultSector;
  const state = options.state ?? manifest.defaultState;
  const entry = manifest.sectors[sector];
  const mood = manifest.states[state];
  if (!entry || !mood) throw new Error("없는 맵 또는 정화 상태");
  const view = await MapView.load(
    blockAssetUrl(entry[state], manifest.revision),
    options.person === false ? undefined : manifest.actors.person,
    options.actors ? manifest.actors.monster : undefined,
    blockAssetUrl(mood.backdrop, manifest.revision),
    {
      blockM: manifest.terrainBlockMeters ?? 0.3,
      personM: manifest.personMeters ?? 1.5,
      stand: entry.stand ?? DEFAULT_STAND,
      backdrop: manifest.backdrop ?? DEFAULT_BACKDROP,
    },
  );
  view.grassFar = manifest.grassFarMeters;
  // Visual continuation beyond the playable 110m cell. No colliders or scatter.
  const land = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({color: state === "purified" ? 0xaddacb : 0x30263c, roughness: .95}));
  land.name = "background_land_nonwalkable";
  land.rotation.x = -Math.PI / 2;
  land.position.set(55, -.035, sector === "i21" ? -560 : -55);
  view.root.add(land);
  if (sector === "i21") {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500),
      new THREE.MeshStandardMaterial({color: state === "purified" ? 0x4d9db3 : 0x30263c,
        emissive: state === "purified" ? 0x2a5a66 : 0x211b2f, emissiveIntensity: .35, roughness: .15}));
    sea.name = "background_sea_nonwalkable"; sea.rotation.x = -Math.PI / 2;
    sea.position.set(55, -.12, -55); view.root.add(sea);
  }
  if (state === "polluted") view.root.traverse(object => {
    const mesh = object as import("three").Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as import("three").MeshStandardMaterial;
    if (/^(sea|pond)/i.test(mesh.name)) material.emissive?.setHex(0x211b2f);
    if (/^(inst_)?spark/i.test(mesh.name)) material.color.setHex(0xa56cce);
  });
  return {view, manifest, sector, state, entry, mood};
}
export {MapView, bl} from "./BlockMapView";
