from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json

root = Path(__file__).resolve().parents[1]
out = root / 'docs'
out.mkdir(exist_ok=True)
frames = sorted((root / 'WEB NÂNG CAO (1)').rglob('*.png'))
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
inventory = []
for batch in range((len(frames) + 5) // 6):
    sheet = Image.new('RGB', (1500, 1560), '#dce0e6')
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(frames[batch*6:batch*6+6]):
        im = Image.open(path)
        index = batch*6+i+1
        inventory.append({'index': index, 'path': str(path.relative_to(root)), 'width': im.width, 'height': im.height})
        x, y = (i%3)*500, (i//3)*780
        thumb = ImageOps.contain(im, (488, 720))
        sheet.paste(thumb, (x+6, y+5))
        label = f'{index:02d} {path.stem}'
        draw.text((x+8, y+731), label[:59], font=font, fill='#111')
        draw.text((x+8, y+752), label[59:118], font=font, fill='#111')
    sheet.save(out / f'frames-{batch+1}.jpg')
(out / 'asset-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(frames)} frames inspected; contact sheets saved to docs/')
