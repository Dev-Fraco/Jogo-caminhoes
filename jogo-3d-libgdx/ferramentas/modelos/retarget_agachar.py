# Retarget do clipe Mixamo "Crouching" para o rig do Jake (jake.g3dj).
# Delta de cada osso no espaço mundial (libGDX, Y para cima, cm), aplicado ao repouso do Jake.
import json, sys
import numpy as np

SRC_MIX, SRC_JAKE, OUT_JSON = sys.argv[1], sys.argv[2], sys.argv[3]
F_IN, F_OUT = int(sys.argv[4]), int(sys.argv[5])          # quadros do clipe Mixamo usados
STEP = int(sys.argv[6]) if len(sys.argv) > 6 else 1      # amostra a cada STEP quadros

def quat_to_mat_xyzw(x, y, z, w):
    n = np.sqrt(x*x + y*y + z*z + w*w); x, y, z, w = x/n, y/n, z/n, w/n
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def mat_to_quat_xyzw(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2; w = 0.25*s; x = (R[2,1]-R[1,2])/s; y = (R[0,2]-R[2,0])/s; z = (R[1,0]-R[0,1])/s
    elif R[0,0] > R[1,1] and R[0,0] > R[2,2]:
        s = np.sqrt(1.0 + R[0,0] - R[1,1] - R[2,2]) * 2; w = (R[2,1]-R[1,2])/s; x = 0.25*s; y = (R[0,1]+R[1,0])/s; z = (R[0,2]+R[2,0])/s
    elif R[1,1] > R[2,2]:
        s = np.sqrt(1.0 + R[1,1] - R[0,0] - R[2,2]) * 2; w = (R[0,2]-R[2,0])/s; x = (R[0,1]+R[1,0])/s; y = 0.25*s; z = (R[1,2]+R[2,1])/s
    else:
        s = np.sqrt(1.0 + R[2,2] - R[0,0] - R[1,1]) * 2; w = (R[1,0]-R[0,1])/s; x = (R[0,2]+R[2,0])/s; y = (R[1,2]+R[2,1])/s; z = 0.25*s
    return [float(x), float(y), float(z), float(w)]

def T(v):
    M = np.eye(4); M[:3, 3] = v; return M

def node_local(n):
    r = n.get('rotation', [0, 0, 0, 1]); t = n.get('translation', [0, 0, 0])
    M = np.eye(4); M[:3, :3] = quat_to_mat_xyzw(*r); M[:3, 3] = t
    return M

# ---------- Mixamo ----------
mx = json.load(open(SRC_MIX))
O = np.array(mx['obj'], float)
Robj = O[:3, :3] / 0.01                     # sem a escala (armature em cm)
G = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)   # Z para cima (Blender) -> Y para cima (libGDX)
Wrot = G @ Robj
Wm4 = np.eye(4); Wm4[:3, :3] = Wrot        # espaço mundial Mixamo, em libGDX, cm
def mix_bone_array(name):
    return np.array(mx['bones'][name]['rest_mat'], float)     # matriz de repouso no armature (linhas do Blender)
mixparent = {n: mx['bones'][n]['parent'] for n in mx['bones']}
def rest_local_mix(n):
    A = mix_bone_array(n)
    p = mixparent[n]
    if p is None: return A
    return np.linalg.inv(mix_bone_array(p)) @ A

def basis(per):   # per: {'q':[w,x,y,z], 'loc':[x,y,z]}
    w, x, y, z = per['q']
    R = quat_to_mat_xyzw(x, y, z, w)
    M = np.eye(4); M[:3, :3] = R; M[:3, 3] = per['loc']
    return M

def mix_world(n, frame_pose):
    p = mixparent[n]
    L = rest_local_mix(n) @ basis(frame_pose[n])
    if p is None: return Wm4 @ L
    return mix_world(p, frame_pose) @ L

# ---------- Jake ----------
jk = json.load(open(SRC_JAKE))
nodes = {}
def collect(n, parent):
    nodes[n['id']] = {'parent': parent, 'local': node_local(n), 'rest': n}
    for c in n.get('children', []): collect(c, n['id'])
for root in jk['nodes']: collect(root, None)
jake_bones = [a['boneId'] for a in [x for x in jk['animations'] if x['id'] == 'Idle'][0]['bones']]
def jake_world_rest(n):
    p = nodes[n]['parent']
    L = nodes[n]['local']
    return L if p is None else jake_world_rest(p) @ L

# mapeamento Jake -> Mixamo (nomes iguais, com as diferenças de perna e dedos)
def mix_name(j):
    m = j.replace('UpperLeg', 'UpLeg').replace('LowerLeg', 'Leg')
    return 'mixamorig:' + m

rest_pose = {n: {'q': [1, 0, 0, 0], 'loc': [0, 0, 0]} for n in mx['bones']}
Wm_rest = {}
for j in jake_bones:
    mn = mix_name(j)
    if mn in mx['bones']:
        Wm_rest[j] = mix_world(mn, rest_pose)
Jw_rest = {j: jake_world_rest(j) for j in jake_bones}

hip_m = Wm_rest['Hips'][:3, 3]; hip_j = Jw_rest['Hips'][:3, 3]
S = float(hip_j[1] / hip_m[1])
print('escala quadril', round(S, 4), 'quadril Jake y', round(float(hip_j[1]), 2), 'Mixamo y', round(float(hip_m[1]), 2))

def delta(j, fr):
    """Delta mundial do osso j no quadro fr (Blender), no espaço do Jake."""
    mn = mix_name(j)
    Wm = mix_world(mn, mx['pose'][fr - mx['f0']])
    D = Wm @ np.linalg.inv(Wm_rest[j])
    if j == 'Hips':
        D = D.copy()
        D[:3, 3] = np.array([0.0, (Wm[1, 3] - Wm_rest[j][1, 3]) * S, 0.0])   # sobe/desce, sem deslizar
    return D

def world_jake(n, fr):
    """Mundo do Jake do nó n no quadro fr (ossos mapeados animados; os outros no repouso)."""
    if n is None: return np.eye(4)
    if n in Wm_rest: return delta(n, fr) @ Jw_rest[n]
    return world_jake(nodes[n]['parent'], fr) @ nodes[n]['local']

out_bones = []
for j in jake_bones:
    keys = []
    mapped = j in Wm_rest
    p = nodes[j]['parent']
    for i, fr in enumerate(range(F_IN, F_OUT + 1, STEP)):
        t_ms = int(round(i * STEP * 1000.0 / mx.get('fps', 60)))
        if mapped:
            W = delta(j, fr) @ Jw_rest[j]
            L = np.linalg.inv(world_jake(p, fr)) @ W
            rot = mat_to_quat_xyzw(L[:3, :3])
            tr = L[:3, 3] if j == 'Hips' else nodes[j]['local'][:3, 3]
        else:
            rot = mat_to_quat_xyzw(nodes[j]['local'][:3, :3])
            tr = nodes[j]['local'][:3, 3]
        keys.append({'keytime': t_ms, 'rotation': [round(float(x), 6) for x in rot],
                     'translation': [round(float(x), 4) for x in tr]})
    out_bones.append({'boneId': j, 'keyframes': keys})
json.dump({'bones': out_bones}, open(OUT_JSON, 'w'))
print('OK ossos', len(out_bones), 'quadros', len(out_bones[0]['keyframes']), 'mapeados', len(Wm_rest))
