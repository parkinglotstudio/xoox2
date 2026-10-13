from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
import json
R=Path(r'C:\soos-arcade');A=R/'assets/arcade/art';O=A/'missions';O.mkdir(parents=True,exist_ok=True)
campaign=json.loads((R/'assets/arcade/config-codex/campaign.json').read_text(encoding='utf-8'))
themes=[(80,142,116),(91,143,167),(178,133,84),(118,103,166),(98,147,132)]
for m in campaign['missions']:
 p=m['profileId'];kind={'p01':'defense','p02':'defense','p03':'survival','p04':'chain'}[p];bg=Image.open(R/'assets/arcade/maps/CODEX_FOREST'/f'{kind}_preview.png').convert('RGB');bg=ImageEnhance.Color(bg).enhance(1.2).resize((640,854));bg=bg.crop((0,160,640,640));tint=Image.new('RGB',bg.size,themes[m['region']-1]);bg=Image.blend(bg,tint,.14).convert('RGBA');d=ImageDraw.Draw(bg)
 shade=Image.new('RGBA',bg.size);sd=ImageDraw.Draw(shade)
 for y in range(480):sd.line((0,y,640,y),fill=(5,26,35,int(max(0,(y-180)*.65))))
 bg.alpha_composite(shade)
 icon={'p01':'fireSeat','p02':'ruon','p03':'ria','p04':m['rescuePetId'] or 'nofilter'}[p];im=Image.open(A/'icons'/f'{icon}.png').convert('RGBA');im=im.crop(im.getbbox());im.thumbnail((280,305));shadow=Image.new('RGBA',bg.size);sd=ImageDraw.Draw(shadow);sd.ellipse((160,345,485,415),fill=(0,0,0,145));bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)));bg.alpha_composite(im,(int((640-im.width)/2),375-im.height))
 d=ImageDraw.Draw(bg);d.rounded_rectangle((25,25,130,68),10,fill=(10,30,39,210),outline=(*themes[m['region']-1],255),width=2);d.text((44,38),f'ZONE {m["region"]}',fill=(240,231,187));d.rectangle((20,450,620,456),fill=(*themes[m['region']-1],255))
 bg.convert('RGB').save(O/(m['id']+'.png'),optimize=True)
manifest=json.loads((A/'manifest.json').read_text(encoding='utf-8'));manifest['missionArt']={'count':20,'method':'Blender map previews + existing voxel asset renders, composed with region palette','files':[m['id']+'.png'for m in campaign['missions']]};(A/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');print('MISSION_ART',len(campaign['missions']))
