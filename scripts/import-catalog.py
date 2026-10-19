"""Inventory supplied assets and import sourced OSM campus coordinates. No inferred room-photo joins."""
from pathlib import Path
from PIL import Image
import json, shutil

root = Path(__file__).resolve().parents[1]
def write(path, text):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

logos = root / 'figma_images/school-logos-thu-duc/school-logos'
catalog = json.loads((logos / 'schools.json').read_text(encoding='utf-8'))
elements = json.loads((root / 'docs/osm-universities.json').read_text(encoding='utf-8'))['elements']
# OSM campus polygons, manually matched by institution + campus, not by file name or proximity.
ids = {'hcmus':1419105579, 'uit':1303838982, 'hcmussh':1419197268,
       'hcmute':218273808, 'hcmuaf':1212036325, 'hcmut':1419118309,
       'hcmiu':1419109086, 'hub':301514506, 'fpt':1022939891,
       'ufm':16241635, 'ush':290326852}
campuses = {'hcmus':'Cơ sở 2 · Khu ĐHQG', 'uit':'Khu ĐHQG', 'hcmussh':'Cơ sở 2 · Khu ĐHQG',
 'hcmute':'Cơ sở Võ Văn Ngân', 'hcmuaf':'Cơ sở Linh Trung', 'hcmut':'Cơ sở Dĩ An',
 'hcmiu':'Khu ĐHQG', 'hub':'Cơ sở Thủ Đức', 'fpt':'Campus TP.HCM · khu Quận 9',
 'ufm':'Cơ sở Võ Văn Hát · khu Quận 9', 'ush':'Cơ sở Linh Trung'}
schools=[]
for row in catalog:
    dest=root/'public/assets/schools'/row['logo']; dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(logos/row['logo'],dest)
    if row['id'] not in ids: continue
    el=next(e for e in elements if e['id']==ids[row['id']]); t=el['tags']; c=el['center']
    addr=' '.join(t.get(k,'') for k in ['addr:housenumber','addr:street','addr:subdistrict']).strip()
    schools.append(dict(id=row['id'],name=row['name'],campus=campuses[row['id']],
      address=addr or campuses[row['id']],lat=c['lat'],lng=c['lon'],
      logo='/assets/schools/'+row['logo'],source=f"https://www.openstreetmap.org/{el['type']}/{el['id']}"))
write('src/app/data/schools.ts', "import { School } from '../models/domain';\n// Sources archived in docs/osm-universities.json; polygon centers, not entrance/route coordinates.\nexport const SCHOOLS: School[] = "+json.dumps(schools,ensure_ascii=False,indent=2)+';\n')
write('docs/school-locations.json', json.dumps(schools,ensure_ascii=False,indent=2))

brand=root/'public/assets/brand'; brand.mkdir(parents=True,exist_ok=True)
shutil.copy2(root/'figma_images/brand/ihouzz-uni-logo-draft.png',brand/'ihouzz-uni-logo-draft.png')
inventory=[]
for p in sorted((root/'figma_images/rooms').glob('*')):
    im=Image.open(p)
    inventory.append(dict(file=str(p.relative_to(root)).replace('\\','/'),width=im.width,height=im.height,
      roomId=None,code=None,status='pending-owner-mapping'))
write('docs/room-assets-pending.json',json.dumps(inventory,ensure_ascii=False,indent=2))
print(f'Imported {len(schools)} sourced campuses, 13 logos, original brand; inventoried {len(inventory)} unassigned room assets.')
