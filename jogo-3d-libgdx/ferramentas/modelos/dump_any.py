# Exporta um FBX para JSON no espaço do Jake: Y para cima, metros, pés em y=0 (altura 1,73 m).
# Uso: blender -b -P dump_any.py -- entrada.fbx saida.json [ossos_ajuste.json]
import bpy, sys, json, math
from mathutils import Matrix, Vector
argv = sys.argv[sys.argv.index('--')+1:]
fbx, out = argv[0], argv[1]
fit = json.load(open(argv[2])) if len(argv) > 2 else None
HEIGHT = 1.73
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
for o in list(bpy.data.objects):
    if o.type not in ('MESH', 'ARMATURE'):
        bpy.data.objects.remove(o, do_unlink=True)
top = [o for o in bpy.data.objects if o.parent is None]
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.polygons) > 0 and 'gernade' not in o.name.lower() and 'grenade' not in o.name.lower()]
for o in bpy.data.objects:
    if o.type == 'MESH' and o not in meshes: bpy.data.objects.remove(o, do_unlink=True)

# 1) gira de Z para cima (Blender) para Y para cima (Jake): Rx(-90)
C = Matrix.Rotation(math.radians(-90), 4, 'X')
root = bpy.data.objects.new('ROOT', None); bpy.context.scene.collection.objects.link(root)
root.matrix_world = C
for o in top:
    o.parent = root
bpy.context.view_layer.update()
# 2) escala para 1,73 m e pés em y=0, centrado em x e z
pts = []
for m in meshes:
    for v in m.data.vertices:
        pts.append(m.matrix_world @ v.co)
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
s = HEIGHT / (mx.y - mn.y)   # depois de Rx(-90) a altura está no eixo Y
T = Matrix.Translation(Vector((-(mn.x + mx.x) / 2 * s, -mn.y * s, -(mn.z + mx.z) / 2 * s)))
root.matrix_world = T @ Matrix.Scale(s, 4) @ C
bpy.context.view_layer.update()
print('ESCALA', s, 'ALTURA_ORIG', mx.y - mn.y)
q=[m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
print('DEBUG pos', [round(min(p[i] for p in q),3) for i in range(3)], [round(max(p[i] for p in q),3) for i in range(3)], 'root', [list(r) for r in root.matrix_world][:3], 'parents', set(m.parent.name if m.parent else None for m in meshes))

if fit:   # esqueleto ajustado (sem ossos na malha): cria, põe os pesos automáticos e segue como armadura
    ad = bpy.data.armatures.new('Fit'); arm = bpy.data.objects.new('Fit', ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for b in fit['bones']:
        eb = ad.edit_bones.new(b['name'])
        eb.head = Vector(b['head']); eb.tail = Vector(b['tail'])
    for b in fit['bones']:
        if b.get('parent'): ad.edit_bones[b['name']].parent = ad.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes: m.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.ops.object.select_all(action='DESELECT')
    

def mat_color(mat):
    if mat is None: return [0.7, 0.7, 0.7]
    if mat.use_nodes and mat.node_tree:
        p = mat.node_tree.nodes.get('Principled BSDF')
        if p: return list(p.inputs['Base Color'].default_value)[:3]
    return list(mat.diffuse_color)[:3]

data = {'objects': [], 'bones': {}, 'pieces': {}, 'materials': {}, 'textures': {}}

def mat_tex(mat):
    if mat is None or not mat.use_nodes or not mat.node_tree: return None
    p = mat.node_tree.nodes.get('Principled BSDF')
    if p and p.inputs['Base Color'].links:
        n = p.inputs['Base Color'].links[0].from_node
        if n.type == 'TEX_IMAGE' and n.image: return n.image.name
    return None
for a in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
    bones = {}
    for b in a.data.bones:
        M = a.matrix_world @ b.matrix_local
        bones[b.name] = [list(r) for r in M]
    data['bones'][a.name] = {'bones': bones, 'parents': {b.name: (b.parent.name if b.parent else None) for b in a.data.bones}}
for m in meshes:
    M = m.matrix_world
    if m.parent and m.parent.type == 'ARMATURE':
        kind = 'armature'; arm_name = m.parent.name
    else:
        kind = 'piece'; arm_name = None
        data['pieces'][m.name] = [list(r) for r in M]
    me = m.data
    me.calc_loop_triangles()
    if hasattr(me, 'calc_normals_split'): me.calc_normals_split()
    N3 = M.to_3x3().inverted_safe().transposed()
    flip = M.determinant() < 0
    verts = [list(M @ v.co) for v in me.vertices]
    wts = []
    for v in me.vertices:
        wts.append([[m.vertex_groups[g.group].name, g.weight] for g in v.groups if g.weight > 0 and g.group < len(m.vertex_groups)] if kind == 'armature' else [])
    uvl = me.uv_layers.active.data if me.uv_layers else None
    tris = []
    for t in me.loop_triangles:
        mi = me.polygons[t.polygon_index].material_index
        mname = m.material_slots[mi].material.name if mi < len(m.material_slots) and m.material_slots[mi].material else 'default'
        mobj = m.material_slots[mi].material if mi < len(m.material_slots) else None
        data['materials'][mname] = mat_color(mobj)
        tn = mat_tex(mobj)
        if tn: data['textures'][mname] = tn
        corners = []
        order = [0, 2, 1] if flip else [0, 1, 2]
        for k in order:
            li = t.loops[k]
            L = me.loops[li]
            uv = list(uvl[li].uv) if uvl else [0.0, 0.0]
            n = (N3 @ Vector(L.normal)).normalized()
            corners.append([L.vertex_index, uv[0], uv[1], n.x, n.y, n.z])
        tris.append([corners, mname])
    data['objects'].append({'name': m.name, 'kind': kind, 'armature': arm_name, 'verts': verts, 'weights': wts, 'tris': tris})
json.dump(data, open(out, 'w'))
print('OBJETOS', len(data['objects']), 'MATERIAIS', list(data['materials'].keys())[:12], 'ARMADURAS', list(data['bones'].keys()))
