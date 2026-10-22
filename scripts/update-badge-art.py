"""Regenerate bundled game badge images (development-only Python + Pillow)."""
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'scripts/badge-art-sources.json').read_text(encoding='utf-8'))
CACHE = ROOT / 'artifacts/badge-art'
OUTPUT = ROOT / 'src/renderer/public/badges'
CACHE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fetch(entry):
    file = CACHE / sha(entry['url'].encode())
    if not file.exists():
        request = Request(entry['url'], headers={'User-Agent': 'PokeTokenDesktop development asset research'})
        with urlopen(request, timeout=30) as response:
            data = response.read(2 * 1024 * 1024)
        assert len(data) < 2 * 1024 * 1024
        file.write_bytes(data)
    data = file.read_bytes()
    assert sha(data) == entry['sha256'], 'Pinned source changed: ' + entry['url']
    return data


with ThreadPoolExecutor(max_workers=3) as pool:
    original = dict(zip(CONFIG['inputs'], pool.map(fetch, CONFIG['inputs'].values())))

assets = {}
for key, definition in CONFIG['assets'].items():
    data = original[definition['input']]
    with Image.open(io.BytesIO(data)) as image:
        assert image.format == 'PNG'
        if 'crop' in definition:
            x, y, width, height = definition['crop']
            assert x >= 0 and y >= 0 and x + width <= image.width and y + height <= image.height
            image = image.crop((x, y, x + width, y + height))
            assert image.mode == 'P'
            if 'palette' in definition:
                # The decompilation atlas stores 4bpp palette banks as global PNG
                # indices; each original badge has its own pristine game palette.
                modulo = definition['paletteModulo']
                image = image.point(lambda index: index % modulo)
                palette = original[definition['palette']].decode().splitlines()
                assert palette[:2] == ['JASC-PAL', '0100']
                image.putpalette([int(c) for line in palette[3:] for c in line.split()])
            image.info['transparency'] = definition['transparentIndex']
            image = image.convert('RGBA')
            if definition.get('trim'):
                image = image.crop(image.getchannel('A').getbbox())
            output = io.BytesIO()
            image.save(output, format='PNG')
            data = output.getvalue()
        else:
            image = image.convert('RGBA')
        assert image.getchannel('A').getbbox(), 'Empty badge: ' + key
        width, height = image.size
        assert 8 <= width <= 512 and 8 <= height <= 512
        assert len(data) < 256 * 1024
        # Decode the output too; this checks every extracted palette pixel.
        with Image.open(io.BytesIO(data)) as decoded:
            assert decoded.convert('RGBA').tobytes() == image.tobytes()
    (OUTPUT / (key + '.png')).write_bytes(data)
    source_keys = [definition['input']] + ([definition['palette']] if 'palette' in definition else [])
    assets[key] = dict(sha256=sha(data), width=width, height=height,
                       pixel=definition['pixel'], originals=[CONFIG['inputs'][name] for name in source_keys],
                       extraction={k: v for k, v in definition.items() if k not in ('input', 'palette', 'pixel')})

catalog = json.loads((ROOT / 'src/shared/league-catalog.json').read_text(encoding='utf-8'))
assert set(CONFIG['goals']) == {g['id'] for g in catalog['goals'] if g['kind'] == 'badge'}
assert set(CONFIG['goals'].values()) == set(assets), 'Unused or missing badge art'
manifest = dict(goals=CONFIG['goals'], assets=assets, notes=CONFIG['notes'])
(ROOT / 'src/shared/badge-art-catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
credits = ['Game badge, Z-Crystal and trial stamp artwork',
           'Original graphics: Nintendo / Game Freak / The Pokemon Company.',
           'Sources: Bulbagarden Archives, PokeAPI/sprites and pret game decompilation projects.',
           'These game image assets are not licensed under this application\'s MIT license.',
           'Native GBA and Platinum sprite/palette atlas frames are extracted losslessly; other PNGs are unchanged.', '', *CONFIG['notes'], '']
for key, item in CONFIG['inputs'].items():
    credits += [key + ': ' + item['game'], item['page'], item['url'], 'SHA-256: ' + item['sha256'], '']
(ROOT / 'src/renderer/public/licenses/Badge-art-credits.txt').write_text('\n'.join(credits), encoding='utf-8')
print(json.dumps(dict(badgeGoals=len(manifest['goals']), images=len(assets), bytes=sum((OUTPUT/(key+'.png')).stat().st_size for key in assets)), indent=2))
