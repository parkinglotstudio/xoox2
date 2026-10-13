from pathlib import Path
import cv2,json,sys
from PIL import Image,ImageDraw,ImageOps
sys.stdout.reconfigure(encoding='utf-8')
root=Path(r'C:\Users\dmaxd\Downloads\38833FF26BA1D.UnigramPreview_g9c9v27vpyspw!App')
jobs=[('survivor','Screen_Recording_20261011_085630_Survivorio.mp4'),('reference_621733','6217330572482585663.mp4')]
for key,file in jobs:
    out=Path(__file__).parent/'reference_analysis'/key;out.mkdir(parents=True,exist_ok=True)
    p=root/file;c=cv2.VideoCapture(str(p));fps=c.get(5);frames=int(c.get(7));dur=frames/fps
    meta=dict(file=str(p),bytes=p.stat().st_size,fps=fps,frames=frames,durationSec=dur,width=int(c.get(3)),height=int(c.get(4)))
    (out/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    ts=sorted(set([0,2,5]+[round(dur*i/23,2) for i in range(24)]));tiles=[]
    for t in ts:
        c.set(cv2.CAP_PROP_POS_MSEC,min(t,dur-.1)*1000);ok,f=c.read()
        if not ok:continue
        im=Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB));im.save(out/f'frame_{t:07.2f}.jpg',quality=90)
        tile=Image.new('RGB',(300,590),'#17202c');sm=ImageOps.contain(im,(300,555));tile.paste(sm,((300-sm.width)//2,0));ImageDraw.Draw(tile).text((8,562),f'{t:.2f}s',fill='white');tiles.append(tile)
    for j in range((len(tiles)+11)//12):
        sheet=Image.new('RGB',(1200,1770),'#17202c')
        for i,tile in enumerate(tiles[j*12:(j+1)*12]):sheet.paste(tile,((i%4)*300,(i//4)*590))
        sheet.save(out/f'contact_{j+1}.jpg',quality=91)
    c.release();print(json.dumps(meta,ensure_ascii=False),flush=True)
