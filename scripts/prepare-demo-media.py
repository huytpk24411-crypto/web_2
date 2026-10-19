"""Explicitly illustrative galleries approved by the owner; never claimed as real room photography."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
groups={
'r1':['loft-ban-cong','7d071880-e6e6-487c-8e2a-7f286b5e3e46','00b4eab2-f135-4adb-ab1c-e2cfc58c19aa'],
'r2':['studio-sang','471aacc0-de47-404e-b2d5-815f79f63115','a2752259-879d-4c0c-9408-f1926ff6ff0b'],
'r3':['a0ce260f-c7c5-4740-a4dc-12e9e392e046','a39667d7-77ad-4952-9cfc-13ea431e8424'],
'r4':['phong-o-ghep','83418844-9865-4df6-b73b-ef75efcba1ca'],
'r5':['studio-ban-cong','093d5d29-daf9-4414-bcc8-8220f53e379c','3aac454a-618b-47fc-9b89-b767311ee4b6'],
'r6':['studio-am-cung'],
'r7':['studio-xanh','34699d4e-1f86-463f-81a3-3b3218460be4'],
'r8':['can-ho-mot-phong-ngu','dfe81ece-d6ab-4e8b-bccc-44caf72aeb42'],
'r9':['0c708659-488b-48ec-907f-a8dee85be1e0','281dfa6f-5622-4efa-bb3a-1e5945375d09'],
'r10':['can-ho-phong-ngu-rieng','ecdd2389-5f07-4413-9eec-f15d62e748fb'],
'r11':['loft-hien-dai','80500c9b-a0f5-44f3-bbbb-7c8847a09708','fb5da02c-e84d-451f-bb53-6a8b2c7203d8'],
'r12':['9c2d4755-7c80-4178-84f2-453b5a017ac3'],
}
manifest=[]; urls={}
for rid,names in groups.items():
 urls[rid]=[]
 for i,name in enumerate(names):
  src=root/'figma_images/rooms'/f'{name}.png'; dst=root/'public/assets/rooms'/f'{rid}-{i+1:02}.webp'
  dst.parent.mkdir(parents=True,exist_ok=True)
  im=Image.open(src).convert('RGB'); im.thumbnail((1400,1050)); im.save(dst,'WEBP',quality=86)
  url='/'+str(dst.relative_to(root/'public')).replace('\\','/'); urls[rid].append(url)
  manifest.append({'roomId':rid,'code':'NESTRO-402' if rid=='r1' else 'UNI-'+str(200+int(rid[1:])), 'source':str(src.relative_to(root)).replace('\\','/'),'url':url,'cover':i==0,'status':'illustrative-group-owner-approved-not-real-room-assignment'})
(root/'docs/room-media-map.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(root/'src/app/data/room-media.ts').write_text('export const ROOM_MEDIA: Record<string, string[]> = '+json.dumps(urls,indent=2)+';\n',encoding='utf8')
used={name for names in groups.values() for name in names}
pending=[p.name for p in (root/'figma_images/rooms').glob('*.png') if p.stem not in used]
(root/'docs/room-assets-pending.json').write_text(json.dumps(pending,indent=2),encoding='utf8')
print(f'{len(manifest)} illustrative images; {len(pending)} unassigned (bathrooms / unmatched interiors).')
