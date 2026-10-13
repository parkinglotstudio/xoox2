from pathlib import Path
import cv2, json, sys
from PIL import Image, ImageOps, ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
video=Path(r'C:\Users\dmaxd\Downloads\38833FF26BA1D.UnigramPreview_g9c9v27vpyspw!App\Screen_Recording_20261011_085021_Cell Survivor.mp4')
out=Path(__file__).parent/'cell_analysis'
out.mkdir(exist_ok=True)
cap=cv2.VideoCapture(str(video))
fps=cap.get(cv2.CAP_PROP_FPS); count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
meta={'file':str(video),'bytes':video.stat().st_size,'fps':fps,'frames':count,'durationSec':count/fps,'width':int(cap.get(3)),'height':int(cap.get(4))}
(out/'metadata.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False),encoding='utf-8')
duration=meta['durationSec']
times=sorted(set([0,2,5]+[round(duration*i/23,2) for i in range(24)]))
thumbs=[]
for i,t in enumerate(times):
    cap.set(cv2.CAP_PROP_POS_MSEC,min(t,duration-0.1)*1000)
    ok,frame=cap.read()
    if not ok: continue
    im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
    im.save(out/f'frame_{t:07.2f}.jpg',quality=90)
    tile=Image.new('RGB',(270,510),'#19212b')
    sm=ImageOps.contain(im,(270,480)); tile.paste(sm,((270-sm.width)//2,0))
    ImageDraw.Draw(tile).text((8,486),f'{t:.2f} s',fill='white')
    thumbs.append(tile)
for batch in range((len(thumbs)+11)//12):
    sheet=Image.new('RGB',(1080,1530),'#19212b')
    for j,tile in enumerate(thumbs[batch*12:(batch+1)*12]):sheet.paste(tile,((j%4)*270,(j//4)*510))
    sheet.save(out/f'contact_{batch+1}.jpg',quality=92)
cap.release()
print(json.dumps(meta,ensure_ascii=False)); print('sheets',len(thumbs))
