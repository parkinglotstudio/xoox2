
from pathlib import Path
import argparse,json,sys,struct,hashlib
from PIL import Image,ImageOps,ImageDraw,ImageFont
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser()
parser.add_argument('--root',required=True)
args=parser.parse_args()
root=Path(args.root).resolve()
out=root/'docs/reports/assets/20261010_village01'
ref=root/'docs/plans/village/references/01_village_concept.png'
render=out/'village01_overall.png'
assert ref.is_file() and render.is_file()
images=[Image.open(ref).convert('RGB'),Image.open(render).convert('RGB')]
fontfile=Path(r'C:\Windows\Fonts\malgun.ttf')
font=ImageFont.truetype(str(fontfile),28)
small=ImageFont.truetype(str(fontfile),20)
width=1280;height=720;padding=26;top=82;bottom=55
sheet=Image.new('RGB',(width*2+padding*3,top+height+bottom),(238,241,234))
draw=ImageDraw.Draw(sheet)
for i,(im,label) in enumerate(zip(images,['이미지 시안 — 구도·분위기 기준','Blender VILLAGE01 — 첫 배치 렌더'])):
    x=padding+i*(width+padding)
    draw.text((x,22),label,font=font,fill=(39,56,53))
    fitted=ImageOps.contain(im,(width,height))
    sheet.paste(fitted,(x+(width-fitted.width)//2,top+(height-fitted.height)//2))
draw.text((padding,top+height+15),'집·섬·선착장의 배치 검수 단계입니다. 건축 세부와 조경·주민 동선은 후속 제작합니다.',font=small,fill=(70,85,81))
sheet.save(out/'village01_comparison.png')
layout=json.loads((root/'data/village/releases/VILLAGE01/layout.json').read_text(encoding='utf-8'))
raw=(root/'data/village/releases/VILLAGE01/village_environment.glb').read_bytes()
assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
n,kind=struct.unpack_from('<II',raw,12)
assert kind==0x4e4f534a
glb=json.loads(raw[20:20+n])
nodes=glb['nodes']
houses=[x['name'] for x in nodes if x.get('name','') in ['house_main','house_pet','house_garden','house_workshop','house_lookout']]
islands=[x['name'] for x in nodes if x.get('name','').startswith('island_') and not x.get('name','').endswith('_mesh')]
color_meshes=sum(all('COLOR_0' in p['attributes'] for p in m['primitives']) for m in glb['meshes'])
referenced_missing=[]
for x in layout['assetPlacements']:
    if not (root/'data'/x['url'].lstrip('/')).is_file():referenced_missing.append(x['url'])
assert len(houses)==5 and len(islands)==5 and not referenced_missing
assert color_meshes==len(glb['meshes'])
assert images[1].size==(1600,900)
actual={'revision':'VILLAGE01','houseNodes':houses,'islandNodes':islands,'meshCount':len(glb['meshes']),'allAuthoredMeshesHaveColor0':True,
 'externalBufferOrImageUris':[x.get('uri') for x in glb.get('buffers',[])+glb.get('images',[]) if x.get('uri')],
 'environmentBytes':len(raw),'environmentSHA256':hashlib.sha256(raw).hexdigest(),
 'residentIds':layout['residentIds'],'assetPlacements':len(layout['assetPlacements']),'referencedFilesMissing':referenced_missing,
 'renderResolution':images[1].size,'allHouseCentersFramed':layout['allHouseCentersFramed'],'browserRunPerformed':False,
 'stage':'Blender first composition, not final detailed art or runtime lobby'}
(root/'data/village/releases/VILLAGE01/artifact_validation.json').write_text(json.dumps(actual,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(actual,ensure_ascii=False))
