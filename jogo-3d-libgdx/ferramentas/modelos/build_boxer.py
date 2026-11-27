import json, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import builder
from builder import *
from mapping import MAP as CCMAP
MAP = dict(CCMAP); MAP['CC_Base_BoneRoot'] = 'CC_Base_BoneRoot'
dump = json.load(open('boxer.json'))
arm = list(dump['bones'].values())[0]['bones']
# texturas: nome do material -> arquivo (já estão em assets/models/boxeador)
import glob, os, shutil
TEXDIR = os.environ.get('TEXDIR', 'tex')   # pasta com as texturas do personagem (ex.: as extraídas do RAR)
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'models', 'boxeador')
os.makedirs(OUTDIR, exist_ok=True)
for m, name in dump['textures'].items():
    hits = sorted(glob.glob(os.path.join(TEXDIR, name + '.*')))
    hits = [h for h in hits if 'Diffuse' in h]
    if not hits:
        print('SEM TEXTURA', m, name); continue
    shutil.copy(hits[0], OUTDIR)
    builder.TEXFILE[m] = os.path.basename(hits[0])
Mb = {}; Rb = {}; heads = {}
for dn, jn in MAP.items():
    if dn not in arm or jn not in JW: continue
    F = rigid(np.array(arm[dn], float))
    Mb[jn] = jrest(jn) @ np.linalg.inv(F); Rb[jn] = Mb[jn][:3, :3]; heads[jn] = F[:3, 3]
def weights_of(oi, o, vid):
    if o['kind'] == 'armature' and o['weights'][vid]:
        ws = [(MAP[n], w) for n, w in o['weights'][vid] if n in MAP and MAP[n] in Mb]
        if ws: return ws
    p = np.array(o['verts'][vid], float)
    best = min(heads, key=lambda k: np.linalg.norm(heads[k] - p))
    return [(best, 1.0)]
write(sys.argv[1], dump, None, Mb, Rb, weights_of)
