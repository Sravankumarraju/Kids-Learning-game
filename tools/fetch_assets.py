"""Download the free (CC0) textures, sky and props the game uses from Poly Haven.

Usage:  python tools/fetch_assets.py
Writes into ./assets and records every file in assets/CREDITS.md.
All Poly Haven assets are CC0 (public domain): https://polyhaven.com/license
"""
import json, os, sys, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
API = 'https://api.polyhaven.com/files/'

HDRIS = {'sky_day': ('kloofendal_48d_partly_cloudy_puresky', '2k')}
# game name -> poly haven id
TEXTURES = {
    'forest_ground': 'forest_ground_04', 'dry_ground': 'brown_mud_dry',
    'laterite': 'red_laterite_soil_stones', 'soil_wall': 'excavated_soil_wall', 'sand': 'coast_sand_01',
    'asphalt': 'asphalt_02', 'ballast': 'gravel', 'concrete': 'concrete', 'paving': 'square_brick_paving',
    'brick': 'brick_wall_10', 'plaster': 'painted_plaster_wall', 'roof_tiles': 'clay_roof_tiles',
    'tin_roof': 'box_profile_metal_sheet', 'planks': 'brown_planks_05', 'rebar_concrete': 'rebar_reinforced_concrete',
    'floor_tiles': 'brown_floor_tiles',
}
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor', 'Rough': 'rough'}
# ambientCG (also CC0): game name -> asset id
AMBIENTCG = {'grass': 'Grass004', 'field': 'Grass001'}
MODELS = ['cement_bag', 'wooden_crate_01', 'street_lamp_01', 'painted_wooden_bench', 'wooden_ladder', 'barrel_03', 'wild_rooibos_bush']


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'BuildMyTown-asset-fetch'})) as r:
        return json.load(r)


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'BuildMyTown-asset-fetch'})
    with urllib.request.urlopen(req) as r, open(dest + '.part', 'wb') as f:
        f.write(r.read())
    os.replace(dest + '.part', dest)
    print('  ', os.path.relpath(dest, ROOT))


def main():
    credits = ['# Asset credits', '', 'All assets below are **CC0** (public domain), from [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com).', '']
    for name, (pid, res) in HDRIS.items():
        d = get_json(API + pid)
        fetch(d['hdri'][res]['hdr']['url'], os.path.join(ROOT, 'sky', name + '.hdr'))
        credits.append(f'- Sky: [{pid}](https://polyhaven.com/a/{pid}) ({res})')
    for name, pid in TEXTURES.items():
        d = get_json(API + pid)
        for key, short in MAPS.items():
            if key not in d:
                continue
            fetch(d[key]['1k']['jpg']['url'], os.path.join(ROOT, 'tex', f'{name}_{short}.jpg'))
        credits.append(f'- Texture `{name}`: [{pid}](https://polyhaven.com/a/{pid})')
    import io, zipfile
    for name, aid in AMBIENTCG.items():
        dest = os.path.join(ROOT, 'tex', f'{name}_diff.jpg')
        if not os.path.exists(dest):
            req = urllib.request.Request(f'https://ambientcg.com/get?file={aid}_1K-JPG.zip', headers={'User-Agent': 'BuildMyTown-asset-fetch'})
            z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(req).read()))
            for src, short in (('Color', 'diff'), ('NormalGL', 'nor'), ('Roughness', 'rough')):
                with open(os.path.join(ROOT, 'tex', f'{name}_{short}.jpg'), 'wb') as f:
                    f.write(z.read(f'{aid}_1K-JPG_{src}.jpg'))
            print('  ', name, aid)
        credits.append(f'- Texture `{name}`: [{aid}](https://ambientcg.com/a/{aid}) (ambientCG, CC0)')
    for pid in MODELS:
        d = get_json(API + pid)
        g = d['gltf']['1k']['gltf']
        base = os.path.join(ROOT, 'models', pid)
        fetch(g['url'], os.path.join(base, pid + '.gltf'))
        for rel, inc in g.get('include', {}).items():
            fetch(inc['url'], os.path.join(base, rel))
        credits.append(f'- Model: [{pid}](https://polyhaven.com/a/{pid})')
    with open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(credits) + '\n')
    print('done')


if __name__ == '__main__':
    sys.exit(main())
