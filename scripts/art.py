"""Build assets/art/<card-id>.webp (200px square WebP) from two fan projects on GitHub.

Sources are shallow-cloned into .cache/ on first run:
  kedarv/unstable                 full card scans (cropped to the art box)
  geniegeist/unstable-unicorns    square illustrations and the card back

Usage:  pip install pillow && python3 scripts/art.py
The artwork is copyright Unstable Games; assets/art is gitignored and for private testing only.
"""
import json, os, subprocess
from PIL import Image

CACHE = '.cache'
REPOS = {
    'kedarv_unstable': 'https://github.com/kedarv/unstable.git',
    'geniegeist_unstable-unicorns': 'https://github.com/geniegeist/unstable-unicorns.git',
}
for name, url in REPOS.items():
    if not os.path.isdir(f'{CACHE}/{name}'):
        os.makedirs(CACHE, exist_ok=True)
        print(f'cloning {url} ...')
        subprocess.run(['git', 'clone', '--depth', '1', '-q', url, f'{CACHE}/{name}'], check=True)

SCANS = f'{CACHE}/kedarv_unstable/public/card_images'
SQUARE = f'{CACHE}/geniegeist_unstable-unicorns/src/assets/card/square'
BACK = f'{CACHE}/geniegeist_unstable-unicorns/src/assets/card/UU-Back-Main.png'
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
