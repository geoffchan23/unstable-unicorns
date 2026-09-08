"""Build assets/art/<card-id>.webp from the two fan-scan sources in the scratchpad.
Sources (cloned from GitHub): kedarv/unstable (full card scans) and geniegeist/unstable-unicorns (square art).
"""
import json, os, sys
from PIL import Image

SCRATCH = '/tmp/claude-0/-home-user-unstable-unicorns/ff932045-9b41-5b25-8571-e1c35bf5fd35/scratchpad'
SCANS = f'{SCRATCH}/kedarv_unstable/public/card_images'
SQUARE = f'{SCRATCH}/geniegeist_unstable-unicorns/src/assets/card/square'
BACK = f'{SCRATCH}/geniegeist_unstable-unicorns/src/assets/card/UU-Back-Main.png'
OUT = 'assets/art'
SIZE = 200

cards = json.load(open('data/base-set-2e.json'))['cards']

def crop_scan(path, half=False):
    im = Image.open(path).convert('RGB')
    if half:
        im = im.crop((0, 0, im.width // 2, im.height))
    w, h = im.size
    # art box on the wiki scans: ~11.5%..88.5% across, ~17%..72.5% down (a square)
    box = (int(w * 0.118), int(h * 0.172), int(w * 0.882), int(h * 0.722))
    return im.crop(box)

def scan_name(c):
    n = c['name']
    if n.startswith('Baby Unicorn (') or n.startswith('Basic Unicorn ('):
        return n.replace(' ', '_')
    return n.replace(' ', '_')

def load(c):
    cid = c['id']
    if c['type'] in ('baby_unicorn', 'basic_unicorn') or cid in ('unicorn-phoenix', 'glitter-tornado'):
        p = f'{SCANS}/{scan_name(c)}.png'
        if os.path.exists(p):
            return crop_scan(p, half=(cid == 'unicorn-phoenix'))
    p = f'{SQUARE}/{cid.replace("-", "_") if cid not in ("re-target", "two-for-one") else cid}.png'
    if os.path.exists(p):
        return Image.open(p).convert('RGB')
    return None

os.makedirs(OUT, exist_ok=True)
missing = []
total = 0
for c in cards:
    im = load(c)
    if im is None:
        missing.append(c['id']); continue
    # center-crop to square, resize
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE, SIZE), Image.LANCZOS)
    out = f'{OUT}/{c["id"]}.webp'
    im.save(out, 'WEBP', quality=78, method=6)
    total += os.path.getsize(out)

back = Image.open(BACK).convert('RGB')
back = back.resize((200, int(200 * back.height / back.width)), Image.LANCZOS)
back.save(f'{OUT}/_back.webp', 'WEBP', quality=78, method=6)
total += os.path.getsize(f'{OUT}/_back.webp')
print(f'{len(cards) - len(missing)} cards, {total/1024:.0f} KB total; missing: {missing}')
