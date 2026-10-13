import pathlib,json,hashlib,datetime
root=pathlib.Path(r'C:\soos-arcade')
out=pathlib.Path(r'C:\Users\dmaxd\Documents\Codex\2026-10-10\in-app-browser-context-source-ambient\claude-audit-20261011')
pack=root/'docs/plans/20261011_3D제작명세_v2_대표4종_Codex'
b=json.loads((pack/'data/handoff-baseline.v2.json').read_text(encoding='utf-8'))
m=json.loads((pack/'data/resource-manifest.v2.json').read_text(encoding='utf-8'))
def verify(rows):
 changed=[];missing=[]
 for f in rows:
  p=root/f['path']
  if not p.is_file():missing.append(f['path']);continue
  got=hashlib.sha256(p.read_bytes()).hexdigest()
  if got!=f['sha256']:changed.append({'path':f['path'],'expected':f['sha256'],'actual':got})
 return {'checked':len(rows),'changed':changed,'missing':missing}
configs=[]
for f in (root/'assets/arcade/config').glob('*.json'):
 src=pack/'data'/(f.stem+'.v2.json')
 if src.exists():configs.append({'path':str(f.relative_to(root)),'same_json':json.loads(f.read_text(encoding='utf-8'))==json.loads(src.read_text(encoding='utf-8'))})
new=[str(p.relative_to(root)).replace('\\','/') for p in (root/'src/arcade').rglob('*') if p.is_file()]
res={'checkedAt':datetime.datetime.now().astimezone().isoformat(),'baselineCapturedAt':b['capturedAt'],'sourceBaseline':verify(b['files']),'resourceBaseline':verify(m['files']),'copiedConfigs':configs,'newArcadeFiles':new}
(out/'integrity.json').write_text(json.dumps(res,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in res.items() if k!='newArcadeFiles'},ensure_ascii=False))
