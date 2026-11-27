import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:]
obj_path, out_png, yaw = argv[0], argv[1], float(argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=obj_path, forward_axis='NEGATIVE_Z', up_axis='Y')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
pts = []
for o in meshes:
    for v in o.bound_box:
        pts.append(o.matrix_world @ Vector(v))
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center = (mn + mx) / 2
height = mx.z - mn.z
# câmera à altura do peito, de frente (yaw gira em torno do personagem)
cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
bpy.context.scene.collection.objects.link(cam)
dist = height * 2.2
target = Vector((center.x, center.y, center.z + height * 0.02))
ang = math.radians(yaw)
cam.location = (target.x + dist * math.sin(ang), target.y - dist * math.cos(ang), target.z + height * 0.05)
direction = target - cam.location
cam.rotation_mode = 'QUATERNION'
cam.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
cam_data.lens = 58
cam_data.clip_end = 100
bpy.context.scene.camera = cam
# luz principal e de preenchimento
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0
sun_o = bpy.data.objects.new('sun', sun); bpy.context.scene.collection.objects.link(sun_o)
sun_o.rotation_euler = (math.radians(50), 0, math.radians(yaw + 30))
fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 400; fill.size = 4
fill_o = bpy.data.objects.new('fill', fill); bpy.context.scene.collection.objects.link(fill_o)
fill_o.location = (target.x - 3 * math.sin(ang), target.y + 3 * math.cos(ang), target.z + 2)
fill_o.rotation_euler = (math.radians(70), 0, math.radians(yaw))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x = 360
scene.render.resolution_y = 540
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print('RENDER OK', out_png)
