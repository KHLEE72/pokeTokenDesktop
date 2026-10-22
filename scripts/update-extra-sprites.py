"""Fetch credited 2D animations and losslessly repack pixel atlases/strips as GIFs.

Developer-only tool: Python 3.11+ and Pillow. No image library is used by the app.
"""
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'artifacts/extra-sprites'
PUBLIC = ROOT / 'src/renderer/public'
CACHE.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT / 'scripts/extra-sprite-sources.json').read_text(encoding='utf-8'))
BASE = json.loads((ROOT / 'src/shared/sprite-catalog.json').read_text(encoding='utf-8'))
NAMES = json.loads((ROOT / 'src/shared/localized-catalog.json').read_text(encoding='utf-8'))['species']
NAMES.update({str(f['id']): f['names'] for f in json.loads((ROOT / 'src/shared/form-catalog.json').read_text(encoding='utf-8'))['forms']})
REVISION = '009cac30c39d3615c7b2c320c3984af368871031'
ROGUE = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/' + REVISION + '/'


def fetch(url):
    file = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not file.exists():
        with urlopen(url, timeout=30) as response:
            data = response.read(2 * 1024 * 1024)
        if len(data) >= 2 * 1024 * 1024:
            raise ValueError('Oversized image/source: ' + url)
        file.write_bytes(data)
    return file.read_bytes()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pixels(image):
    return list(image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata())


def inspect(data):
    image = Image.open(io.BytesIO(data))
    assert image.format == 'GIF' and max(image.size) <= 512
    frames = set()
    for index in range(image.n_frames):
        image.seek(index)
        frames.add(digest(image.convert('RGBA').tobytes()))
    assert image.n_frames > 1 and len(frames) > 1, 'Static GIF rejected'
    return dict(sha256=digest(data), frames=image.n_frames, uniqueFrames=len(frames), width=image.width, height=image.height)


def visible_hash(image):
    image = image.convert('RGBA')
    clean = Image.new('RGBA', image.size)
    clean.paste(image, (0, 0), image.getchannel('A'))
    return digest(clean.tobytes())


def encode_frames(rendered, duration):
    # One shared palette preserves colors exactly; no quantization or dithering.
    colors = sorted({pixel[:3] for image in rendered for pixel in pixels(image) if pixel[3]})
    assert len(colors) < 256
    palette = [0, 0, 0] + [channel for color in colors for channel in color]
    palette += [0] * (768 - len(palette))
    indices = {color: i + 1 for i, color in enumerate(colors)}
    encoded = []
    for image in rendered:
        rgba = pixels(image)
        assert all(pixel[3] in (0, 255) for pixel in rgba)
        frame = Image.frombytes('P', image.size, bytes(indices[p[:3]] if p[3] else 0 for p in rgba))
        frame.putpalette(palette)
        encoded.append(frame)
    output = io.BytesIO()
    encoded[0].save(output, format='GIF', save_all=True, append_images=encoded[1:], duration=duration, loop=0, transparency=0, disposal=2, optimize=False)
    data = output.getvalue()
    assert len(data) < 2 * 1024 * 1024, 'GIF exceeds runtime cache limit'
    with Image.open(io.BytesIO(data)) as decoded:
        timeline = []
        for index in range(decoded.n_frames):
            decoded.seek(index)
            # Repeated frames may merge. Compare every original playback instant.
            frame_duration = decoded.info['duration']
            assert frame_duration % duration == 0
            timeline.extend([visible_hash(decoded)] * (frame_duration // duration))
    assert timeline == [visible_hash(image) for image in rendered], 'Conversion changed pixels, alpha, position or timing'
    return data


def bundled(number, variant, data):
    filename = str(number) + ('-shiny' if variant == 'shiny' else '') + '.gif'
    (PUBLIC / 'sprites').mkdir(parents=True, exist_ok=True)
    (PUBLIC / 'sprites' / filename).write_bytes(data)
    return dict(url='bundled:' + filename, **inspect(data))


def animation(entry):
    assert NAMES[str(entry['id'])]['en'] == entry['name'], 'Species/form mapping changed'
    source = CONFIG['source']
    base = source['repository'].replace('github.com', 'raw.githubusercontent.com') + '/' + source['revision'] + '/'
    result = dict(id=entry['id'], name=entry['name'], source='ghasty', credits=entry['credits'])
    for variant in ('normal', 'shiny'):
        # Existing animated pixel sprites keep their original source.
        assert entry['id'] not in BASE['animated'][variant]
        url = base + quote(entry[variant], safe='/')
        result[variant] = dict(url=url, **inspect(fetch(url)))
    return result


def wattrel(variant):
    prefix = 'images/pokemon/exp/' + ('shiny/' if variant == 'shiny' else '') + '940'
    png_url, json_url = ROGUE + prefix + '.png', ROGUE + prefix + '.json'
    png, atlas = fetch(png_url), fetch(json_url)
    sheet = Image.open(io.BytesIO(png)).convert('RGBA')
    frames = json.loads(atlas)['textures'][0]['frames']
    rendered = []
    for frame in frames:
        assert not frame['rotated']
        size, box, offset = frame['sourceSize'], frame['frame'], frame['spriteSourceSize']
        image = Image.new('RGBA', (size['w'], size['h']))
        image.paste(sheet.crop((box['x'], box['y'], box['x'] + box['w'], box['y'] + box['h'])), (offset['x'], offset['y']))
        rendered.append(image)
    data = encode_frames(rendered, 100)
    return dict(**bundled(940, variant, data), originalPng=dict(url=png_url, sha256=digest(png)), originalAtlas=dict(url=json_url, sha256=digest(atlas)), atlasFrames=len(frames), frameDurationMs=100)


def strip_animation(entry):
    assert NAMES[str(entry['id'])]['en'] == entry['name'], 'Species/form mapping changed'
    source = CONFIG['ebdx']
    base = source['repository'].replace('github.com', 'raw.githubusercontent.com') + '/' + source['revision'] + '/'
    result = dict(id=entry['id'], name=entry['name'], source='ebdx', credits=entry['credits'], normal=None, shiny=None)
    for variant in ('normal', 'shiny'):
        original = entry[variant]
        if not original:
            continue
        assert entry['id'] not in BASE['animated'][variant], 'Existing GIF must keep its source'
        assert variant != 'shiny' or entry['id'] not in source['keepStaticShiny']
        url = base + quote(original['path'], safe='/')
        png = fetch(url)
        assert digest(png) == original['sha256'], 'Pinned strip changed: ' + url
        with Image.open(io.BytesIO(png)) as image:
            assert image.format == 'PNG' and 0 < image.height <= 512 and image.width % image.height == 0
            sheet = image.convert('RGBA')
        size = sheet.height
        rendered = [sheet.crop((x, 0, x + size, size)) for x in range(0, sheet.width, size)]
        assert len(rendered) == original['frames']
        assert len({visible_hash(frame) for frame in rendered}) == original['uniqueFrames'] > 1
        data = encode_frames(rendered, source['frameDurationMs'])
        result[variant] = dict(**bundled(entry['id'], variant, data), originalPng=dict(url=url, sha256=digest(png)), sourceForm=entry['form'], stripFrames=len(rendered), frameDurationMs=source['frameDurationMs'])
    if result['normal'] and result['shiny']:
        assert result['normal']['sha256'] != result['shiny']['sha256'], 'Shiny must have its own colors'
    return result


with ThreadPoolExecutor(max_workers=4) as pool:
    pokemon = list(pool.map(animation, CONFIG['pokemon']))
pokemon.append(dict(id=940, name='Wattrel', source='pokerogue', credits=['Pagefault Games contributors (experimental pixel sprite)'], normal=wattrel('normal'), shiny=wattrel('shiny')))
ebdx = CONFIG['ebdx']
assert set(ebdx['keepStaticShiny']) == {10282, 10283, 10298}
for variant in ('normal', 'shiny'):
    missing = {int(number) for number in NAMES} - set(BASE['animated'][variant]) - {p['id'] for p in pokemon if p.get(variant)}
    replacements = {p['id'] for p in ebdx['pokemon'] if p[variant]}
    assert replacements == missing - (set(ebdx['keepStaticShiny']) if variant == 'shiny' else set()), 'Static roster coverage changed'
with ThreadPoolExecutor(max_workers=4) as pool:
    for index, entry in enumerate(pool.map(strip_animation, ebdx['pokemon']), 1):
        pokemon.append(entry)
        if index % 25 == 0:
            print(f'EBDX strips converted and pixel-verified: {index}/{len(ebdx["pokemon"])}', flush=True)
manifest = dict(sources=dict(ghasty=CONFIG['source'], pokerogue=dict(repository='https://github.com/pagefaultgames/pokerogue-assets', revision=REVISION, permission='CC-BY-NC-SA-4.0', credits='README.md', adaptation='Pixel atlas repacked as a looping GIF at 100 ms per frame; artwork unchanged.'), ebdx=dict(repository=ebdx['repository'], revision=ebdx['revision'], credits='EBDX-sprite-credits.txt', adaptation='Square PNG strip frames repacked as looping GIFs at 90 ms per source frame; pixel artwork unchanged.', keepStaticShiny=ebdx['keepStaticShiny'])), pokemon=sorted(pokemon, key=lambda p: p['id']))
(ROOT / 'src/shared/extra-sprite-catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
license_file = PUBLIC / 'licenses/PokeRogue-CC-BY-NC-SA-4.0.txt'
license_file.write_bytes(fetch(ROGUE + 'LICENSES/CC-BY-NC-SA-4.0.txt'))
credits = ['Additional animated 2D pixel sprites', '', 'Ghasty001 animations: free to use with credit, as stated in the pinned upstream README.', CONFIG['source']['repository'] + '/blob/' + CONFIG['source']['revision'] + '/README.md', 'Credits include the original base sprite artists:', '']
credits += [str(p['id']) + ' ' + p['name'] + ': ' + ', '.join(p['credits']) for p in pokemon if p['source'] == 'ghasty']
credits += ['', 'Wattrel, normal and shiny: Pagefault Games contributors.', 'https://github.com/pagefaultgames/pokerogue-assets/tree/' + REVISION, 'License: CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/', 'Adaptation: atlas frames repacked as GIF; pixel artwork unchanged.', 'Full license: PokeRogue-CC-BY-NC-SA-4.0.txt', '', 'Pokémon characters remain the property of their respective rights holders. These asset permissions do not license this project’s code.']
readme_url = ebdx['repository'].replace('github.com', 'raw.githubusercontent.com') + '/' + ebdx['revision'] + '/README.md'
readme = fetch(readme_url)
assert digest(readme) == ebdx['readmeSha256'], 'Pinned creator credits changed'
(PUBLIC / 'licenses/EBDX-sprite-credits.txt').write_bytes(readme)
credits += ['', 'EBDX Renovation Project animated 2D sprites', ebdx['repository'] + '/tree/' + ebdx['revision'], 'Full upstream creator credits: EBDX-sprite-credits.txt', 'Mega sprites: Aronousqui. Other contributors include the Smogon sprite projects, Sprites Animados and mangalos810; see per-appearance credits below and the full upstream README.', 'Adaptation: PNG strips repacked as GIF at 90 ms per frame without changing colors, transparency, positions or frame order.', 'These fan/game assets are not covered by this application\'s MIT license.', 'Shiny Mega Meganium, Mega Feraligatr and Mega Barbaracle retain their previous PNG: upstream normal/shiny strips have identical colors.', '']
credits += [str(p['id']) + ' ' + p['name'] + ': ' + ', '.join(p['credits']) for p in pokemon if p['source'] == 'ebdx']
(PUBLIC / 'licenses/Extra-sprite-credits.txt').write_text('\n'.join(credits) + '\n', encoding='utf-8')
print(json.dumps(dict(appearances=len(pokemon), variants=sum(bool(p.get(v)) for p in pokemon for v in ('normal', 'shiny')), ebdxVariants=sum(bool(p.get(v)) for p in pokemon if p['source'] == 'ebdx' for v in ('normal', 'shiny')), bundledBytes=sum(p.stat().st_size for p in (PUBLIC / 'sprites').glob('*.gif'))), indent=2))
