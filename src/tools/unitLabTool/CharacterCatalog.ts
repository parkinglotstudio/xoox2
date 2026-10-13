/** Active character choices. Internal asset prefixes stay stable for skin/FX compatibility. */
export const CHARACTER_CATALOG = [
  {key:'RUON',name:'루온',gender:'남자',body:'기존 비율',file:'A/wanderer_A.glb?v=A02-crown',portrait:'A/reference_face.png'},
  {key:'RUON_35',name:'루온',gender:'남자',body:'3.5등신',file:'Ruon_35/ruon_35.glb?v=RUON35-03-crown',portrait:'A/reference_face.png'},
  {key:'RIA',name:'리아',gender:'여자',body:'기존 비율',file:'D/wanderer_D.glb?v=D08',portrait:'D/reference_face.png'},
  {key:'RIA_35',name:'리아',gender:'여자',body:'3.5등신',file:'D_35/wanderer_D_35.glb?v=D35-01',portrait:'D/reference_face.png'},
] as const;
export const CHARACTER_ALIASES:Record<string,string>={A:'RUON',A35:'RUON_35',D:'RIA',D35:'RIA_35',DS:'RIA_35'};
export function characterLabel(key:string){const c=CHARACTER_CATALOG.find(c=>c.key===key);return c?`${c.name} · ${c.body}`:key;}