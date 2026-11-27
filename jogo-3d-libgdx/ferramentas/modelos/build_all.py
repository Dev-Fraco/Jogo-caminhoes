import os
import json, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from builder import *

def centroid_of(dump, name):
    for o in dump['objects']:
        if o['name'] == name:
            return np.array(o['verts'], float).mean(0)
    return None

# ---------- droide: ossos reais (rig) ----------
def build_droide(out):
    dump = json.load(open('droid.json'))
    arm = list(dump['bones'].values())[0]['bones']
    MAP = {'base': 'Hips', 'stomache': 'Spine', 'chest': 'Spine2', 'neck': 'Neck', 'head': 'Head',
           'sholdrL': 'LeftShoulder', 'uparmL': 'LeftArm', 'BotarmL': 'LeftForeArm', 'handL': 'LeftHand',
           'thighL': 'LeftUpperLeg', 'legL': 'LeftLowerLeg', 'f1': 'LeftFoot',
           'sholdrR': 'RightShoulder', 'uparmR': 'RightUpperArm', 'BotarmR': 'RightForeArm', 'handR': 'RightHand',
           'thighR': 'RightUpperLeg', 'legR': 'RightLowerLeg', 'f2': 'RightFoot'}
    Mb = {}; Rb = {}; heads = {}
    for dn, jn in MAP.items():
        F = rigid(np.array(arm[dn], float))
        Mb[jn] = jrest(jn) @ np.linalg.inv(F)
        Rb[jn] = Mb[jn][:3, :3]
        heads[jn] = F[:3, 3]
    def weights_of(oi, o, vid):
        if o['kind'] == 'armature' and o['weights'][vid]:
            ws = [(MAP[n], w) for n, w in o['weights'][vid] if n in MAP]
            if ws: return ws
        p = np.array(o['verts'][vid], float)
        best = min(heads, key=lambda k: np.linalg.norm(heads[k] - p))
        return [(best, 1.0)]
    write(out, dump, None, Mb, Rb, weights_of)

# ---------- lutador: sem ossos; pesos por distância num esqueleto em pose T ----------
def build_lutador(out):
    dump = json.load(open('full_fit_src.json'))
    fit = json.load(open('fit_full.json'))['bones']
    Fh = {b['name']: np.array(b['head'], float) for b in fit}
    Ft = {b['name']: np.array(b['tail'], float) for b in fit}
    Mb = {}; Rb = {}
    for b in fit:
        n = b['name']
        M = swing(Fh[n], Ft[n] - Fh[n], jhead(n), jdir(n))
        Mb[n] = M; Rb[n] = M[:3, :3]
    names = list(Mb.keys())
    def weights_of(oi, o, vid):
        p = np.array(o['verts'][vid], float)
        ds = {}
        for n in names:
            d = seg_dist(p, Fh[n], Ft[n])
            ds[n] = float(d)
        ws = [(n, math.exp(-(d / 0.08) ** 2)) for n, d in ds.items()]
        return [(n, w) for n, w in ws if w > 1e-4] or [(min(ds, key=ds.get), 1.0)]
    write(out, dump, None, Mb, Rb, weights_of)

# ---------- robô: peças rígidas, cada peça no osso mais próximo ----------
def build_robo(out):
    dump = json.load(open('robot.json'))
    c = lambda n: centroid_of(dump, n)
    J = {}
    J['Hips'] = (c('TorsoBottom'), c('Spine') - c('TorsoBottom'))
    J['Spine'] = (c('Spine'), c('TorsoUp') - c('Spine'))
    J['Spine2'] = (c('TorsoUp'), c('Neck') - c('TorsoUp'))
    J['Neck'] = (c('Neck'), c('Head') - c('Neck'))
    J['Head'] = (c('Head'), np.array([0, 0.2, 0.0]))
    for s, sd in (('L', 'Left'), ('R', 'Right')):
        J[sd + ('UpperArm' if sd == 'Right' else 'Arm')] = (c(s + '_Shoulder_Joint'), c(s + '_Elbow_Joint') - c(s + '_Shoulder_Joint'))
        J[sd + 'ForeArm'] = (c(s + '_Elbow_Joint'), c(s + '_Wrist_Joint') - c(s + '_Elbow_Joint'))
        J[sd + 'Hand'] = (c(s + '_Wrist_Joint'), c(s + '_Hand') - c(s + '_Wrist_Joint'))
        J[sd + 'UpperLeg'] = (c(s + '_Hip_Joint'), c(s + '_Knee_Joint') - c(s + '_Hip_Joint'))
        J[sd + 'LowerLeg'] = (c(s + '_Knee_Joint'), c(s + '_Shin') - c(s + '_Knee_Joint'))
        J[sd + 'Foot'] = (c(s + '_Foot'), np.array([0, 0, 0.1]))
    # Peças rígidas: a geometria fica como está no repouso e cada peça é presa ao osso mais próximo
    # (o osso do Jake é a referência de articulação; no repouso a malha não se desloca).
    Mb = {}; Rb = {}
    for n in J:
        Mb[n] = np.eye(4); Rb[n] = np.eye(3)
    # peça -> osso: nome conhecido, senão o osso cujo segmento está mais perto do centro da peça
    NAMED = {'Head': 'Head', 'Neck': 'Neck', 'Spine': 'Spine', 'TorsoUp': 'Spine2', 'TorsoBottom': 'Hips'}
    for s, sd in (('L', 'Left'), ('R', 'Right')):
        ua = 'UpperArm' if sd == 'Right' else 'Arm'
        NAMED.update({s + '_Shoulder_Joint': sd + ua, s + '_UpperArm': sd + ua, s + '_Elbow_Joint': sd + 'ForeArm',
                      s + '_Forearm': sd + 'ForeArm', s + '_Wrist_Joint': sd + 'Hand', s + '_Hand': sd + 'Hand',
                      s + '_Thumb': sd + 'Hand', s + '_Index': sd + 'Hand', s + '_Middle': sd + 'Hand', s + '_Ring': sd + 'Hand',
                      s + '_Hip_Joint': sd + 'UpperLeg', s + '_Thigh': sd + 'UpperLeg', s + '_Knee_Joint': sd + 'LowerLeg',
                      s + '_Shin': sd + 'LowerLeg', s + '_Foot': sd + 'Foot'})
    assign = {}
    for o in dump['objects']:
        if o['name'] in NAMED: assign[o['name']] = NAMED[o['name']]
        else:
            cen = np.array(o['verts'], float).mean(0)
            best = min(J, key=lambda n: float(seg_dist(cen, J[n][0], J[n][0] + J[n][1])))
            assign[o['name']] = best
    print('atribuição', {k: v for k, v in assign.items()})
    def weights_of(oi, o, vid):
        return [(assign[o['name']], 1.0)]
    write(out, dump, None, Mb, Rb, weights_of)

if __name__ == '__main__':
    which = sys.argv[1]
    out = sys.argv[2]
    {'droide': build_droide, 'lutador': build_lutador, 'robo': build_robo}[which](out)
