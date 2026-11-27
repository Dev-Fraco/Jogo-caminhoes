import os
# g3dj (repouso) -> OBJ + MTL, só para gerar a miniatura do personagem no Blender.
import json, sys, os
src, out_obj, tex_dir = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(src))
def find(n, key):
    if n['id'] == key: return n
    for c in n.get('children', []):
        r = find(c, key)
        if r: return r
    return None
char = None
for top in d['nodes']: char = find(top, 'character') or char
meshes = {m['id']: m for m in d['meshes']}
part_to_mesh = {}
for m in d['meshes']:
    for p in m['parts']: part_to_mesh[p['id']] = (m['id'], p)
mtl_lines = []; mats = {m['id']: m for m in d['materials']}
for mat in d['materials']:
    mtl_lines.append(f"newmtl {mat['id']}")
    dr, dg, db = (mat.get('diffuse') or [1, 1, 1])[:3]
    mtl_lines.append(f"Kd {dr} {dg} {db}")
    for t in mat.get('textures', []):
        if t.get('type') == 'DIFFUSE':
            mtl_lines.append(f"map_Kd {os.path.join(tex_dir, t['filename'])}")
    mtl_lines.append("")
obj = ['mtllib ' + os.path.basename(out_obj).replace('.obj', '.mtl')]
voff = 0; ntot = 0
groups = []
for part in char['parts']:
    mid, p = part_to_mesh[part['meshpartid']]
    m = meshes[mid]
    attrs = m['attributes']; stride = sum(2 if a.startswith('BLENDWEIGHT') else (3 if a in ('POSITION', 'NORMAL') else 2) for a in attrs)
    vs = m['vertices']; n = len(vs) // stride
    arr = [vs[i*stride:(i+1)*stride] for i in range(n)]
    # posição, normal e UV (v invertido de volta para o OBJ)
    base = {}
    if mid not in base:
        for r in arr:
            obj.append(f"v {r[0]} {r[1]} {r[2]}")
        for r in arr:
            obj.append(f"vt {r[6]} {1 - r[7]}")
        for r in arr:
            obj.append(f"vn {r[3]} {r[4]} {r[5]}")
        base[mid] = voff; voff += n
    o = base[mid] + 1
    idx = p['indices']
    faces = []
    for t in range(0, len(idx), 3):
        a, b, c = idx[t] + o, idx[t+1] + o, idx[t+2] + o
        faces.append(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}")
    groups.append((part['materialid'], faces))
for mat, faces in groups:
    obj.append(f"usemtl {mat}")
    obj.extend(faces)
open(out_obj, 'w').write('\n'.join(obj) + '\n')
open(out_obj.replace('.obj', '.mtl'), 'w').write('\n'.join(mtl_lines) + '\n')
print('ok', len(groups), 'grupos', voff, 'vértices')
