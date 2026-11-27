# Conversor geral: JSON do dump_any (espaço do Jake) -> g3dj com o esqueleto e as animações do Jake.
import json, math, sys, os, numpy as np
JAKE = os.environ.get('JAKE_G3DJ', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'modelos_fonte', 'g3dj', 'models', 'jake', 'jake.g3dj'))
jd = json.load(open(JAKE))
TEXFILE = {}   # nome do material -> arquivo da textura (preenchido pelo construtor)

def trs(n):
    t = np.array(n.get('translation', [0, 0, 0]), float); r = np.array(n.get('rotation', [0, 0, 0, 1]), float)
    s = np.array(n.get('scale', [1, 1, 1]), float); x, y, z, w = r
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * s[None, :]; M[:3, 3] = t
    return M
JW = {}
def walk(n, p):
    W = p @ trs(n); JW[n['id']] = W
    for c in n.get('children', []): walk(c, W)
for top in jd['nodes']: walk(top, np.eye(4))

def jhead(name): return JW[name][:3, 3].copy()
def jrest(name):
    M = JW[name].copy(); M[:3, :3] /= 0.01     # o nó Armature tem escala 0,01
    return M
# Direção de cada osso do Jake: até o filho da cadeia
JCHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Neck1', 'Neck1': 'Head',
          'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'LeftHand': 'LeftHandMiddle1',
          'LeftUpperLeg': 'LeftLowerLeg', 'LeftLowerLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase',
          'RightShoulder': 'RightUpperArm', 'RightUpperArm': 'RightForeArm', 'RightForeArm': 'RightHand', 'RightHand': 'RightHandMiddle1',
          'RightUpperLeg': 'RightLowerLeg', 'RightLowerLeg': 'RightFoot', 'RightFoot': 'RightToeBase'}
def jdir(name):
    if name in JCHILD and JCHILD[name] in JW:
        d = JW[JCHILD[name]][:3, 3] - JW[name][:3, 3]
    else:
        d = np.array([0, 1, 0], float)
    return d / (np.linalg.norm(d) or 1)

def rigid(M):
    X = M.copy(); s = np.linalg.norm(M[:3, 0]); X[:3, :3] = M[:3, :3] / s; return X
def unit(v): return v / (np.linalg.norm(v) or 1)
def rot_align(a, b):
    a = unit(np.asarray(a, float)); b = unit(np.asarray(b, float))
    v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        if c > 0: return np.eye(3)
        p = np.cross(a, [1, 0, 0]);  p = p if np.linalg.norm(p) > 1e-6 else np.cross(a, [0, 0, 1])
        p = unit(p); return 2 * np.outer(p, p) - np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))
def T(p):
    M = np.eye(4); M[:3, 3] = p; return M
def swing(Fh, Fd, Jh, Jd):   # leva o osso de F (cabeça Fh, direção Fd) para J (cabeça Jh, direção Jd)
    R = np.eye(4); R[:3, :3] = rot_align(Fd, Jd)
    return T(Jh) @ R @ T(-np.asarray(Fh, float))
def seg_dist(p, a, b):
    ab = b - a; t = np.clip(np.dot(p - a, ab) / (np.dot(ab, ab) or 1), 0, 1)
    return np.linalg.norm(p - (a + t * ab), axis=-1)

def write(out, dump, bone_names, Mb, Rb, weights_of, obj_bone=None):
    """Monta o g3dj. weights_of(obj, vid) -> [(bone, w)]; Mb/Rb: transformações por osso."""
    part_bones = None
    def find(n, key):
        if n['id'] == key: return n
        for c in n.get('children', []):
            r = find(c, key)
            if r: return r
        return None
    char = None
    for top in jd['nodes']: char = find(top, 'character') or char
    part_bones = char['parts'][0]['bones']
    bidx = {b['node']: i for i, b in enumerate(part_bones)}
    verts = []; keymap = {}; parts = {}   # material -> indices
    attrs = ['POSITION', 'NORMAL', 'TEXCOORD0', 'BLENDWEIGHT0', 'BLENDWEIGHT1', 'BLENDWEIGHT2', 'BLENDWEIGHT3']
    dropped = set()
    for oi, o in enumerate(dump['objects']):
        cache = {}
        for corners, mat in o['tris']:
            for c in corners:
                vid, u, v, nx, ny, nz = c
                if vid not in cache:
                    p = np.array(o['verts'][vid], float)
                    ws = [(b, w) for b, w in weights_of(oi, o, vid) if b in bidx]
                    tot = sum(w for _, w in ws) or 1.0
                    ws = sorted(ws, key=lambda t: -t[1])[:4]
                    tot = sum(w for _, w in ws) or 1.0
                    ws = [(b, w / tot) for b, w in ws]
                    P = np.zeros(3); N = np.zeros(3)
                    for b, w in ws:
                        P += w * (Mb[b][:3, :3] @ p + Mb[b][:3, 3])
                        N += w * (Rb[b] @ np.array([nx, ny, nz]))
                    cache[vid] = (P, unit(N), ws)
                P, N, ws = cache[vid]
                key = (oi, vid, round(u, 5), round(v, 5), round(N[0], 3), round(N[1], 3), round(N[2], 3))
                if key not in keymap:
                    keymap[key] = len(verts)
                    row = [P[0], P[1], P[2], N[0], N[1], N[2], u, 1.0 - v]
                    ws4 = ws + [(part_bones[0]['node'], 0.0)] * (4 - len(ws))
                    for b, w in ws4: row += [bidx.get(b, 0), w]
                    verts.append(row)
                parts.setdefault(mat, []).append(keymap[key])
    mats = []
    for m in parts:
        if dump.get('textures', {}).get(m):
            mats.append({'id': m, 'diffuse': [1, 1, 1], 'textures': [{'id': 'tex_' + m, 'filename': dump['textures'][m] + '.png' if False else TEXFILE.get(m, dump['textures'][m]), 'type': 'DIFFUSE'}]})
        else:
            mats.append({'id': m, 'diffuse': [float(x) for x in dump['materials'].get(m, [0.7, 0.7, 0.7])]})
    mesh_parts = [{'id': f'part_{i}', 'type': 'TRIANGLES', 'indices': idx} for i, (m, idx) in enumerate(parts.items())]
    char['parts'] = [{'meshpartid': f'part_{i}', 'materialid': m, 'bones': part_bones} for i, m in enumerate(parts.keys())]
    jd['meshes'] = [{'id': 'nova_mesh', 'attributes': attrs, 'vertices': [x for r in verts for x in r], 'parts': mesh_parts}]
    jd['materials'] = mats
    jd['id'] = 'nova'
    json.dump(jd, open(out, 'w'))
    print('vértices', len(verts), 'triângulos', sum(len(p['indices']) for p in mesh_parts) // 3, 'materiais', len(mats))
    P = np.array([r[:3] for r in verts]); print('bbox', P.min(0).round(3), P.max(0).round(3))
