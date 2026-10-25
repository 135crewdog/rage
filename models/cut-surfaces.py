# Cuts the control surfaces out of the uncut F-16C glTF along the model's own
# hinge lines and writes them back as named parts (stabL, stabR, flapL, flapR,
# rudder), each with its origin on its hinge, so the renderer can rotate them.
# A developer tool, run once; needs Blender's Python module (pip install bpy):
#
#   python cut-surfaces.py uncut.glb f16c.glb
#
# Stations are metres from the nose; the hinge lines are where the author
# drew them: flaperons along the painted line from 10.17 m at 1.1 m off the
# centreline to 10.55 m at 3.67 m, where they end; stabilators outboard of
# the body side at 1.1 m with the pivot at 13.25 m; rudder from (13.3 m,
# 1.17 m up) at the fairing to (14.59 m, 3.13 m up) under the fin's tip cap,
# which stays with the fin. The second cut: the first ran the flaperons
# square across at 10.45 m out to 3.9 m, and the rudder up the cap's loop to
# the very tip.
import bpy, bmesh, math, sys
from mathutils import Vector
SRC, DST = sys.argv[-2], sys.argv[-1]
NOSE = -7.45   # model z of the pitot tip
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
body = [o for o in bpy.data.objects if o.type == 'MESH' and 'Glass' not in o.name][0]
body.name = 'F16'
# Blender (x, y, z) = (model x, -model z, model y). Helpers in model terms:
def S(co): return -co.y - NOSE          # metres from the nose
def UP(co): return co.z
def X(co): return co.x
def B(x, s, up): return Vector((x, -(s + NOSE), up))   # model (x, s, up) -> Blender

bm = bmesh.new(); bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
def faces_where(pred):
    return [f for f in bm.faces if all(pred(v.co) for v in f.verts)]
def bisect(pred, point, normal):
    geom = faces_where(pred)
    edges = {e for f in geom for e in f.edges}; verts = {v for f in geom for v in f.verts}
    bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + geom, dist=1e-4, plane_co=point, plane_no=normal, use_snap_center=False, clear_inner=False, clear_outer=False)
    bm.faces.ensure_lookup_table()

# flaperon hinge: the painted line from (1.1 m out, 10.17 m) to (3.67 m out, 10.55 m), each wing; ends at 1.1 and 3.67 m
FLAP_IN, FLAP_OUT = (1.1, 10.17), (3.67, 10.55)
flap = {}
for sx in (1, -1):
    wing = lambda co, sx=sx: 9.4 < S(co) < 11.6 and 0.9 < sx * X(co) < 4.9 and abs(UP(co)) < 0.45
    pin, pout = B(sx * FLAP_IN[0], FLAP_IN[1], 0), B(sx * FLAP_OUT[0], FLAP_OUT[1], 0)
    dh = (pout - pin).normalized()
    nh = Vector((-dh.y, dh.x, 0)).normalized()       # perpendicular to the hinge in the wing's plane
    if (B(sx * 2.0, 10.9, 0) - pin).dot(nh) < 0: nh = -nh   # aft counts positive
    bisect(wing, pin, nh)
    te = lambda co, sx=sx: 10.0 < S(co) < 11.6 and 0.9 < sx * X(co) < 4.9 and abs(UP(co)) < 0.45
    for x in (FLAP_IN[0], FLAP_OUT[0]):
        bisect(te, B(sx * x, 10.9, 0), Vector((1, 0, 0)))
    flap[sx] = (pin, nh, dh)
# rudder hinge: through (13.3 m, 1.17 up) and (14.59 m, 3.13 up); its top under the fin's cap at 3.135 up
p1, p2 = B(0, 13.3, 1.17), B(0, 14.59, 3.13)
RUDDER_TOP = 3.135
d = (p2 - p1).normalized()
n = Vector((0, d.z, -d.y)).normalized()        # perpendicular to the hinge in the y–z plane
fin = lambda co: UP(co) > 1.1 and 12.4 < S(co) < 15.3 and abs(X(co)) < 0.6
bisect(fin, p1, n)
bisect(fin, B(0, 14.0, RUDDER_TOP), Vector((0, 0, 1)))
bm.to_mesh(body.data); bm.free(); body.data.update()

# select-and-separate helpers
def separate(name, pred, origin):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    me = body.data; count = 0
    for f in me.polygons:
        cos = [me.vertices[i].co for i in f.vertices]
        f.select = all(pred(c) for c in cos) and extra(name, cos)
        count += f.select
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    part = [o for o in bpy.context.selected_objects if o != body][0]
    part.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.select_all(action='DESELECT'); part.select_set(True); bpy.context.view_layer.objects.active = part
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    print(name, 'faces', count, 'origin', [round(c, 3) for c in origin])
def extra(name, cos):
    if name.startswith('stab'): return max(abs(X(c)) for c in cos) > 1.15   # not the body's side panel
    return True
eps = 1e-3
# flaperons: aft of the hinge plane, between the end cuts; origin at the inboard end of the hinge
for side, sx in (('flapR', 1), ('flapL', -1)):
    pin, nh, dh = flap[sx]
    separate(side, lambda co, sx=sx, pin=pin, nh=nh: (Vector(co) - pin).dot(nh) > -eps and S(co) < 11.6 and FLAP_IN[0] - eps < sx * X(co) < FLAP_OUT[0] + eps and abs(UP(co)) < 0.45, pin)
    print(side, 'hinge direction (model x, up, aft):', round(dh.x, 4), round(dh.z, 4), round(-dh.y, 4))
# stabilators: outboard of the body side, aft of 12.1 m; pivot at 45 % root chord
for side, sx in (('stabR', 1), ('stabL', -1)):
    separate(side, lambda co, sx=sx: S(co) > 12.1 and sx * X(co) > 1.09 - eps and abs(UP(co)) < 0.6, B(sx * 1.1, 13.25, 0.04))
# rudder: aft of the hinge plane, above the fairing
def aft_of_hinge(co): return (Vector(co) - p1).dot(n) < eps if (Vector(co) - p1).dot(n) < 0 else False
# decide the sign of n: the TE (s 14.6, up 2.0) must count as aft
te_pt = B(0, 14.6, 2.0); aft_sign = 1 if (te_pt - p1).dot(n) > 0 else -1
separate('rudder', lambda co: 1.1 < UP(co) < RUDDER_TOP + eps and abs(X(co)) < 0.6 and aft_sign * (Vector(co) - p1).dot(n) > -eps, p1)
print('hinge direction (model x, up, aft):', 0, round(d.z, 4), round(-d.y, 4))

for o in bpy.data.objects:
    if o.type == 'MESH': print(o.name, 'verts', len(o.data.vertices), 'faces', len(o.data.polygons), 'origin', [round(c, 3) for c in o.location])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
    export_apply=True, export_yup=True, export_normals=True, export_texcoords=True, export_materials='EXPORT', export_animations=False, export_skins=False, export_extras=False)
import os; print('wrote', DST, os.path.getsize(DST), 'bytes')
