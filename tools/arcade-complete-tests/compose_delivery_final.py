from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json

R=Path(r'C:\soos-arcade')
D=R/'docs/reports/assets/20261011_ArcadeComplete_Codex'
FONT=r'C:\Windows\Fonts\malgun.ttf'
font=lambda n:ImageFont.truetype(FONT,n)
im=Image.new('RGB',(1624,964),'#0a2027');d=ImageDraw.Draw(im)
d.text((26,13),'수스 아케이드 · 대표 4종 실제 플레이',font=font(28),fill='#eef8e8')
d.text((26,53),'기획툴에서 개별 실행 · 동일 게임의 수치 조절 · Blender 맵 / 기존 복셀 자산',font=font(17),fill='#a6c9c0')
titles=['코어 / 시설 방어','FPS · 같은 방어 규칙','정화숲 대생존','체인 대열 정화']
files=['game1-battle-final.png','game2-showcase-final.png','game3-showcase-final.png','game4-showcase-final.png']
for i,(name,title) in enumerate(zip(files,titles)):
 x=14+i*404;d.text((x+7,91),title,font=font(21),fill='#ffe3a0')
 im.paste(Image.open(D/name).convert('RGB'),(x,124))
im.save(D/'overview-final.png')

manifest=json.loads((R/'assets/arcade/art/manifest.json').read_text(encoding='utf-8'))
names=[x['id'] for x in manifest['icons']]
w=8*144;h=((len(names)+7)//8)*168
sheet=Image.new('RGB',(w,h),'#163035');ds=ImageDraw.Draw(sheet)
for i,name in enumerate(names):
 x=(i%8)*144;y=(i//8)*168
 image=Image.open(R/'assets/arcade/art/icons'/f'{name}.png').convert('RGBA')
 image.thumbnail((136,136));sheet.paste(image,(x+4,y+2),image)
 ds.text((x+4,y+140),name,font=font(11),fill='#eef9e9')
sheet.save(D/'card-art-contact-final.png')
print('COMPOSED_OVERVIEW_AND_CARD_CONTACT')
