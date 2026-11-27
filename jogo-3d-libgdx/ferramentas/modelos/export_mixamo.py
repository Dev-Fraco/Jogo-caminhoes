import bpy, json, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
act = bpy.data.actions[0]
arm.animation_data_create()
arm.animation_data.action = act
scn = bpy.context.scene
f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
data = {'obj': [list(r) for r in arm.matrix_world], 'fps': scn.render.fps, 'scale': list(arm.matrix_world.to_scale()), 'frames': f1 - f0 + 1, 'f0': f0, 'fps': scn.render.fps,
        'bones': {}}
for b in arm.data.bones:
    parent = b.parent.name if b.parent else None
    data['bones'][b.name] = {'parent': parent,
        'rest_head': list(b.head_local), 'rest_mat': [list(r) for r in b.matrix_local]}
hips_y = []
for fr in range(f0, f1 + 1):
    scn.frame_set(fr)
    per = {}
    for pb in arm.pose.bones:
        q = pb.rotation_quaternion if pb.rotation_mode == 'QUATERNION' else pb.rotation_euler.to_quaternion()
        per[pb.name] = {'q': list(q), 'loc': list(pb.location)}
    data.setdefault('pose', []).append(per)
json.dump(data, open(out, 'w'))
print('OK frames', data['frames'], 'rotmode', arm.pose.bones[0].rotation_mode, 'scale', data['scale'])
