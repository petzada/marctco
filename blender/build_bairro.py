"""Monta a maquete do bairro no Blender, salva blender/bairro.blend e exporta o .glb.

Roda no Blender aberto (pelo Blender MCP ou por `python blender/run_in_blender.py
blender/build_bairro.py`) ou sem interface: `blender -b --python blender/build_bairro.py`.
Depois: `pnpm models` comprime o .glb (Meshopt) para public/models/bairro.glb.

Contrato com o site (src/scene/world.ts):
- Um Empty por fachada com o nome da coleção: street, shop_gmb, shop_lp, shop_social,
  billboard_ads, studio_ai. O site troca cada grupo provisório pelo Empty de mesmo nome.
- Materiais "glass*" acendem: dentro de uma fachada, viram o vidro dela; "glass_filler"
  são as janelas do bairro (acendem no final) e "glass_lamp" os postes.
- Actions com o id da seção (gmb, lp, social, ads, ai) tocam com o scroll, do início ao
  fim enquanto a câmera está na fachada.
- Coordenadas pensadas no espaço do three.js (Y para cima); B() converte para o Blender.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = globals().get("REPO") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLEND_PATH = os.path.join(REPO, "blender", "bairro.blend")
RAW_GLB = os.path.join(REPO, "blender", "export", "bairro.raw.glb")

FACADE_X = {"gmb": 0, "lp": 7, "social": 14, "ads": 21, "ai": 32}
FRONT = -3.0  # z da frente das fachadas
FPS = 24
FRAMES = 48  # cada Action dura 2 s; o site escala para o trecho de scroll


def B(x, y, z):
    """three.js (Y para cima, Z para a câmera) → Blender (Z para cima)."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------- cena limpa


def reset():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, FRAMES + 1


# ---------------------------------------------------------------- materiais


def material(name, gray, roughness=0.9):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    # Pelo tipo, não pelo nome: com a interface em português o nó vem traduzido
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        output = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None) or nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(bsdf.outputs[0], output.inputs[0])
    bsdf.inputs["Base Color"].default_value = (gray, gray, gray, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (gray, gray, gray, 1)
    return mat


def srgb(v):
    """Cinza sRGB (0–255) → linear, como o three.js lê o baseColor do glTF."""
    c = v / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def build_materials():
    m = {
        name: material(name, srgb(v))
        for name, v in {
            "base": 0x16,
            "edge": 0x0F,
            "road": 0x22,
            "lane": 0x4A,
            "curb": 0x44,
            "sidewalk": 0x3A,
            "wall": 0x5A,
            "wall_dark": 0x47,
            "wall_light": 0x66,
            "filler": 0x2F,
            "filler_trim": 0x38,
            "roof": 0x2B,
            "tile": 0x33,
            "trim": 0x70,
            "door": 0x1C,
            "pole": 0x3D,
            "metal": 0x52,
            "crown": 0x41,
        }.items()
    }
    glass = ("glass_gmb", "glass_lp", "glass_social", "glass_ads", "glass_ai", "glass_lamp")
    for name in glass + tuple(f"glass_filler_{i}" for i in range(3)):
        m[name] = material(name, srgb(0x1A), roughness=0.4)
    return m


# ---------------------------------------------------------------- geometria


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    return coll, root


def obj_from_bm(name, bm, mat, coll, parent, location=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    coll.objects.link(obj)
    obj.parent = parent
    return obj


def bm_box(w, h, d, offset=(0, 0, 0), bevel=0.0):
    """Caixa w (x) × h (altura) × d (profundidade), centro em `offset` no espaço do three."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(B(*offset)) @ Matrix.Diagonal((w, d, h, 1)))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES", profile=0.5)
    return bm


def box(name, w, h, d, x, y, z, mat, coll, parent, bevel=0.0):
    return obj_from_bm(name, bm_box(w, h, d, bevel=bevel), mat, coll, parent, B(x, y, z))


def cylinder(name, r_bottom, r_top, h, segments, x, y, z, mat, coll, parent, rotation=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r_bottom, radius2=r_top, depth=h
    )
    obj = obj_from_bm(name, bm, mat, coll, parent, B(x, y, z))
    if rotation:
        obj.rotation_euler = rotation
    return obj


def ico(name, r, x, y, z, mat, coll, parent, subdivisions=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=r)
    return obj_from_bm(name, bm, mat, coll, parent, B(x, y, z))


def gable(name, w, h, d, x, y, z, mat, coll, parent):
    """Telhado de duas águas: base em y, cumeeira ao longo de X."""
    bm = bmesh.new()
    pts = []
    for sx in (-w / 2, w / 2):
        pts.append(bm.verts.new(B(sx, 0, -d / 2)))
        pts.append(bm.verts.new(B(sx, 0, d / 2)))
        pts.append(bm.verts.new(B(sx, h, 0)))
    a0, a1, a2, b0, b1, b2 = pts
    for face in ((a0, a1, a2), (b2, b1, b0), (a0, b0, b1, a1), (a1, b1, b2, a2), (a2, b2, b0, a0)):
        bm.faces.new(face)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, mat, coll, parent, B(x, y, z))


def merge(parts):
    """Junta várias bmesh numa só; devolve a bmesh e o nº de faces de cada parte."""
    bm = bmesh.new()
    counts = []
    for part in parts:
        counts.append(len(part.faces))
        tmp = bpy.data.meshes.new("tmp")
        part.to_mesh(tmp)
        part.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return bm, counts


def join(name, parts, coll, parent, location):
    """Objeto único feito de várias partes (bmesh, material), com um material por parte."""
    bm, counts = merge([part for part, _ in parts])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for _, mat in parts:
        if mesh.materials.find(mat.name) < 0:
            mesh.materials.append(mat)
    owner = [mesh.materials.find(mat.name) for (_, mat), n in zip(parts, counts) for _ in range(n)]
    for poly in mesh.polygons:
        poly.material_index = owner[poly.index]
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    coll.objects.link(obj)
    obj.parent = parent
    return obj


# ---------------------------------------------------------------- animação


def keyframes(obj, path, frames_values, action_name, index=-1):
    for frame, value in frames_values:
        setattr_path(obj, path, value, index)
        obj.keyframe_insert(data_path=path, frame=frame, index=index)
    obj.animation_data.action.name = action_name
    for fcurve in action_fcurves(obj.animation_data.action):
        for k in fcurve.keyframe_points:
            k.interpolation = "BEZIER"
            k.easing = "AUTO"


def setattr_path(obj, path, value, index):
    prop = getattr(obj, path)
    if index >= 0:
        prop[index] = value
    else:
        setattr(obj, path, value)


def action_fcurves(action):
    if hasattr(action, "fcurves") and len(getattr(action, "fcurves", [])):
        return action.fcurves
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


# ---------------------------------------------------------------- bairro


def windows_grid(prefix, x, z, w, h, facing, coll, parent, m):
    """Janelas de prédio de enchimento, em 3 grupos para acenderem em níveis diferentes."""
    cols = max(1, round(w / 1.3))
    rows = int((h - 0.6) // 1.1)
    groups = [[], [], []]
    front = facing * 0.04
    for row in range(rows):
        for c in range(cols):
            wx = -w / 2 + (w / cols) * (c + 0.5)
            groups[(row * 7 + c * 5 + int(x)) % 3].append(bm_box(0.6, 0.7, 0.06, (wx, 1.1 + row * 1.1, front)))
    for i, parts in enumerate(groups):
        if parts:
            bm, _ = merge(parts)
            obj_from_bm(f"{prefix}_windows_{i}", bm, m[f"glass_filler_{i}"], coll, parent, B(x, 0, z))


def filler(name, x, z, w, h, facing, coll, parent, m):
    d = 3.2
    cz = z + (-d / 2 if facing == 1 else d / 2)
    box(f"{name}_body", w, h, d, x, h / 2, cz, m["filler"], coll, parent, bevel=0.03)
    box(f"{name}_cornice", w + 0.2, 0.18, d + 0.2, x, h + 0.09, cz, m["filler_trim"], coll, parent)
    windows_grid(name, x, z, w, h, facing, coll, parent, m)
    # Caixa d'água e condensadoras no telhado
    tx = x + (w / 4 if int(x) % 2 else -w / 4)
    cylinder(f"{name}_tank", 0.45, 0.5, 0.7, 10, tx, h + 0.6, cz, m["metal"], coll, parent)
    box(f"{name}_tank_base", 1.0, 0.2, 1.0, tx, h + 0.2, cz, m["filler_trim"], coll, parent)
    box(f"{name}_ac", 0.6, 0.4, 0.5, 2 * x - tx, h + 0.2, cz + 0.6, m["metal"], coll, parent)


def tree(name, x, z, coll, parent, m):
    box(f"{name}_trunk", 0.16, 0.9, 0.16, x, 0.45, z, m["pole"], coll, parent)
    crown = ico(f"{name}_crown", 0.7, x, 1.55, z, m["crown"], coll, parent, subdivisions=1)
    crown.scale = (1, 1, 1.25)
    crown.rotation_euler = (0, 0, x)


def lamp(name, x, z, coll, parent, m):
    side = -1 if z < 0 else 1
    box(f"{name}_pole", 0.08, 2.6, 0.08, x, 1.3, z, m["pole"], coll, parent)
    box(f"{name}_arm", 0.08, 0.06, 0.5, x, 2.6, z - side * 0.22, m["pole"], coll, parent)
    box(f"{name}_head", 0.26, 0.1, 0.26, x, 2.52, z - side * 0.45, m["glass_lamp"], coll, parent)


def build_street(m):
    coll, root = collection("street")
    box("base", 50, 0.8, 19, 15, -0.4, -2.5, m["base"], coll, root)
    box("base_edge", 50.4, 0.2, 19.4, 15, -0.75, -2.5, m["edge"], coll, root)
    box("road", 50, 0.02, 3, 15, 0.01, 0, m["road"], coll, root)
    box("road_cross", 3, 0.02, 19, 25.5, 0.012, -2.5, m["road"], coll, root)
    for i, x in enumerate(range(-9, 40, 2)):
        if x < 23 or x > 28:
            box(f"lane_{i}", 0.9, 0.025, 0.12, x, 0.02, 0, m["lane"], coll, root)
    for i, z in enumerate((-1.05, -0.45, 0.15, 0.75)):
        box(f"zebra_{i}", 1.4, 0.025, 0.32, 23.2, 0.02, z + 0.15, m["lane"], coll, root)
    for side, z in (("n", -2.25), ("s", 2.25)):
        for i, (x0, x1) in enumerate(((-10, 24), (27, 40))):
            box(f"sidewalk_{side}{i}", x1 - x0, 0.12, 1.5, (x0 + x1) / 2, 0.06, z, m["sidewalk"], coll, root)
            cz = z + (0.72 if z < 0 else -0.72)
            box(f"curb_{side}{i}", x1 - x0, 0.16, 0.08, (x0 + x1) / 2, 0.08, cz, m["curb"], coll, root)

    for i, (x, w, h) in enumerate(((-5, 3.6, 4.4), (3.6, 2.4, 5.2), (10.6, 2.6, 4.6), (17.6, 2.4, 5.8), (37.4, 3.8, 5))):
        filler(f"gap_{i}", x, FRONT, w, h, 1, coll, root, m)
    for i, (x, w, h) in enumerate(
        ((-6, 4.4, 7), (-1, 4.6, 8.4), (4, 4.2, 6.6), (9, 4.8, 9.2), (14, 4.4, 7.4), (19, 4.6, 8.6), (30, 4.8, 7.8), (35.5, 5, 9))
    ):
        filler(f"back_{i}", x, -8.6, w, h, 1, coll, root, m)

    for i, x in enumerate((-7.5, -3, 3.5, 10.5, 17.5, 22, 30, 36.5)):
        tree(f"tree_{i}", x, 4, coll, root, m)
    for i, x in enumerate((1.5, 8.5, 15.5, 33.5)):
        box(f"bench_{i}", 1.4, 0.08, 0.45, x, 0.5, 2.6, m["trim"], coll, root)
        for dx in (-0.55, 0.55):
            box(f"bench_{i}_leg{dx}", 0.08, 0.4, 0.4, x + dx, 0.3, 2.6, m["pole"], coll, root)
    for i, x in enumerate((-7, 3.6, 10.6, 17.6, 28, 37)):
        lamp(f"lamp_n{i}", x, -1.7, coll, root, m)
    for i, x in enumerate((-4, 3.6, 10.6, 17.6, 28.5, 37)):
        lamp(f"lamp_s{i}", x, 1.7, coll, root, m)


def build_bakery(m):
    coll, root = collection("shop_gmb")
    x, w, d = FACADE_X["gmb"], 4.6, 3.2
    cz = FRONT - d / 2
    box("gmb_body", w, 3.2, d, x, 1.6, cz, m["wall"], coll, root, bevel=0.03)
    box("gmb_base", w + 0.08, 0.35, d + 0.08, x, 0.175, cz, m["wall_dark"], coll, root)
    gable("gmb_roof", w + 0.4, 1.5, d + 0.5, x, 3.2, cz, m["tile"], coll, root)
    box("gmb_chimney", 0.4, 1.2, 0.4, x + 1.4, 4.0, cz - 0.6, m["wall_dark"], coll, root)
    box("gmb_door", 1.0, 2.0, 0.08, x, 1.0, FRONT + 0.01, m["door"], coll, root)
    for i, wx in enumerate((x - 1.5, x + 1.5)):
        box(f"gmb_window_{i}", 1.1, 1.2, 0.06, wx, 1.5, FRONT + 0.02, m["glass_gmb"], coll, root)
        box(f"gmb_sill_{i}", 1.3, 0.08, 0.2, wx, 0.86, FRONT + 0.08, m["trim"], coll, root)
    box("gmb_sign", 1.8, 0.4, 0.1, x, 2.95, FRONT + 0.05, m["trim"], coll, root)

    # Toldo em ripas: abre (gira para fora) na seção gmb
    pivot = B(x, 2.7, FRONT + 0.02)
    slats = []
    for i in range(8):
        sx = -w / 2 + w / 16 + i * w / 8
        slats.append((bm_box(w / 8, 0.05, 0.95, (sx, 0, 0.475)), m["trim"] if i % 2 else m["wall_dark"]))
    awning = join("gmb_awning", slats, coll, root, pivot)
    # π/2: pendurado rente à parede; ~0,35: aberto, caindo para a calçada
    keyframes(awning, "rotation_euler", [(1, 1.5), (FRAMES * 0.6, 0.2), (FRAMES + 1, 0.35)], "gmb", index=0)


def build_shop(m):
    coll, root = collection("shop_lp")
    x, d = FACADE_X["lp"], 3.4
    cz = FRONT - d / 2
    box("lp_body", 5.2, 3.8, d, x, 1.9, cz, m["wall_dark"], coll, root, bevel=0.03)
    box("lp_parapet", 5.4, 0.3, d + 0.2, x, 3.95, cz, m["roof"], coll, root)
    box("lp_sign", 5.2, 0.5, 0.12, x, 3.3, FRONT + 0.04, m["trim"], coll, root)
    box("lp_door", 0.9, 2.1, 0.08, x + 2.0, 1.05, FRONT + 0.01, m["door"], coll, root)
    box("lp_vitrine", 3.6, 2.0, 0.06, x - 0.55, 1.45, FRONT + 0.02, m["glass_lp"], coll, root)
    box("lp_vitrine_sill", 3.8, 0.12, 0.3, x - 0.55, 0.4, FRONT + 0.12, m["trim"], coll, root)
    box("lp_shutter_box", 3.8, 0.28, 0.3, x - 0.55, 2.62, FRONT + 0.15, m["metal"], coll, root)

    # Porta de aço da vitrine: sobe (encolhe para a caixa) e revela a tela
    bm = bm_box(3.7, 2.1, 0.04, (0, -1.05, 0))
    for i in range(1, 14):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(B(0, -i * 0.15, 0.03)) @ Matrix.Diagonal((3.7, 0.02, 0.02, 1)))
    shutter = obj_from_bm("lp_shutter", bm, m["metal"], coll, root, B(x - 0.55, 2.5, FRONT + 0.12))
    keyframes(shutter, "scale", [(1, 1.0), (FRAMES * 0.45, 0.04), (FRAMES + 1, 0.04)], "lp", index=2)


def build_salon(m):
    coll, root = collection("shop_social")
    x, d = FACADE_X["social"], 3.2
    cz = FRONT - d / 2
    box("social_body", 4.4, 3.4, d, x, 1.7, cz, m["wall_light"], coll, root, bevel=0.03)
    box("social_roof", 4.6, 0.6, d + 0.2, x, 3.7, cz, m["roof"], coll, root)
    box("social_door", 1.1, 2.1, 0.08, x, 1.05, FRONT + 0.01, m["door"], coll, root)
    for i, wx in enumerate((x - 1.45, x + 1.45)):
        box(f"social_window_{i}", 0.9, 1.3, 0.06, wx, 1.6, FRONT + 0.02, m["glass_social"], coll, root)
    cylinder("social_round", 0.4, 0.4, 0.06, 12, x, 2.75, FRONT + 0.03, m["glass_social"], coll, root, (math.pi / 2, 0, 0))
    for i in range(5):
        cylinder(f"social_pole_{i}", 0.1, 0.1, 0.24, 8, x + 0.85, 1.2 + i * 0.24, FRONT + 0.2, m["trim"] if i % 2 else m["door"], coll, root)

    # Placa bandeira: gira para fora da parede na seção social
    bm = bm_box(0.06, 0.7, 0.9, (0, 0, 0.5))
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(B(0, 0.4, 0.05)) @ Matrix.Diagonal((0.08, 0.08, 0.08, 1)))
    blade = obj_from_bm("social_blade_sign", bm, m["trim"], coll, root, B(x - 1.9, 2.9, FRONT + 0.02))
    keyframes(blade, "rotation_euler", [(1, math.pi / 2), (FRAMES * 0.5, -0.12), (FRAMES + 1, 0.0)], "social", index=2)


def build_corner(m):
    coll, root = collection("billboard_ads")
    x = FACADE_X["ads"]
    box("ads_body", 3.6, 2.8, 3.2, x - 1.8, 1.4, FRONT - 1.6, m["wall_dark"], coll, root, bevel=0.03)
    box("ads_door", 0.9, 1.9, 0.08, x - 1.8, 0.95, FRONT + 0.01, m["door"], coll, root)
    bx, bz = x + 1.2, FRONT - 0.6
    for i, dx in enumerate((-1.4, 1.4)):
        box(f"ads_post_{i}", 0.16, 4.4, 0.16, bx + dx, 2.2, bz - 0.15, m["pole"], coll, root)
        for j in range(4):
            box(f"ads_brace_{i}{j}", 0.04, 0.04, 0.6, bx + dx, 1 + j, bz - 0.15, m["pole"], coll, root)
    box("ads_frame", 4.6, 2.4, 0.2, bx, 5.6, bz - 0.2, m["edge"], coll, root)
    box("ads_catwalk", 4.6, 0.06, 0.6, bx, 4.35, bz + 0.1, m["metal"], coll, root)
    box("ads_panel", 4.4, 2.2, 0.04, bx, 5.6, bz - 0.08, m["glass_ads"], coll, root)
    box("ads_text_a", 2.4, 0.42, 0.03, bx - 0.8, 6.15, bz - 0.04, m["door"], coll, root)
    box("ads_text_b", 1.6, 0.18, 0.03, bx - 1.2, 5.6, bz - 0.04, m["door"], coll, root)
    box("ads_image", 1.1, 1.1, 0.03, bx + 1.3, 5.45, bz - 0.04, m["door"], coll, root)

    # Refletores do outdoor: barra única que inclina para o painel na seção ads
    parts = [(bm_box(4.0, 0.06, 0.06, (0, 0, 0)), m["pole"])]
    for dx in (-1.4, 0, 1.4):
        parts.append((bm_box(0.3, 0.18, 0.28, (dx, 0.0, 0.3)), m["metal"]))
    lamps = join("ads_lamps", parts, coll, root, B(bx, 4.45, bz + 0.35))
    keyframes(lamps, "rotation_euler", [(1, -0.9), (FRAMES * 0.4, 0.55), (FRAMES + 1, 0.45)], "ads", index=0)


def build_studio(m):
    coll, root = collection("studio_ai")
    x, d = FACADE_X["ai"], 4.0
    cz = FRONT - d / 2
    box("ai_body", 6.4, 4.2, d, x, 2.1, cz, m["wall_dark"], coll, root, bevel=0.03)
    box("ai_roof", 6.6, 0.3, d + 0.2, x, 4.35, cz, m["roof"], coll, root)
    box("ai_opening", 3.6, 3.0, 0.08, x, 1.5, FRONT + 0.01, m["door"], coll, root)
    box("ai_strip", 3.8, 0.12, 0.06, x, 3.15, FRONT + 0.03, m["glass_ai"], coll, root)
    box("ai_column", 0.5, 3.2, 0.06, x + 2.5, 1.9, FRONT + 0.02, m["glass_ai"], coll, root)
    cylinder("ai_mast", 0.05, 0.05, 1.6, 6, x - 2.4, 5.3, cz, m["pole"], coll, root)
    dish = cylinder("ai_dish", 0.55, 0.15, 0.22, 12, x - 1.6, 4.85, cz + 0.6, m["metal"], coll, root)
    dish.rotation_euler = (0.6, 0, 0.4)

    # Porta de enrolar do estúdio: sobe na seção ai
    bm = bm_box(3.5, 2.9, 0.05, (0, -1.45, 0))
    for i in range(1, 19):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(B(0, -i * 0.155, 0.035)) @ Matrix.Diagonal((3.5, 0.02, 0.02, 1)))
    door = obj_from_bm("ai_door", bm, m["metal"], coll, root, B(x, 2.98, FRONT + 0.06))
    keyframes(door, "scale", [(1, 1.0), (FRAMES * 0.5, 0.05), (FRAMES + 1, 0.05)], "ai", index=2)


# ---------------------------------------------------------------- otimizar


def consolidate():
    """Junta as peças estáticas de cada coleção por material: poucas chamadas de desenho no site.

    Ficam separados os objetos animados e os de vários materiais (toldo, refletores).
    """
    bpy.context.view_layer.update()
    for coll in bpy.data.collections:
        root = bpy.data.objects.get(coll.name)
        groups = {}
        for obj in list(coll.objects):
            if obj.type != "MESH" or obj.animation_data or len(obj.data.materials) != 1:
                continue
            groups.setdefault(obj.data.materials[0].name, []).append(obj)
        for mat_name, objs in groups.items():
            if len(objs) < 2:
                continue
            bm = bmesh.new()
            to_root = root.matrix_world.inverted()
            for obj in objs:
                tmp = obj.data.copy()
                tmp.transform(to_root @ obj.matrix_world)
                bm.from_mesh(tmp)
                bpy.data.meshes.remove(tmp)
            for obj in objs:
                mesh = obj.data
                bpy.data.objects.remove(obj, do_unlink=True)
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
            obj_from_bm(f"{coll.name}__{mat_name}", bm, bpy.data.materials[mat_name], coll, root)


# ---------------------------------------------------------------- salvar e exportar


def export():
    os.makedirs(os.path.dirname(RAW_GLB), exist_ok=True)
    windows = bpy.context.window_manager.windows
    override = {"window": windows[0]} if windows else {}
    with bpy.context.temp_override(**override):
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, compress=True)
        export_glb()


def export_glb():
    bpy.ops.export_scene.gltf(
        filepath=RAW_GLB,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_materials="EXPORT",
    )


def frame_view():
    """Enquadra a maquete na viewport, para quem estiver olhando o Blender."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                region = next(r for r in area.regions if r.type == "WINDOW")
                with bpy.context.temp_override(window=window, area=area, region=region):
                    bpy.ops.view3d.view_all()
                area.spaces.active.shading.type = "SOLID"


def main():
    reset()
    m = build_materials()
    build_street(m)
    build_bakery(m)
    build_shop(m)
    build_salon(m)
    build_corner(m)
    build_studio(m)
    consolidate()
    bpy.context.scene.frame_set(FRAMES + 1)
    if not bpy.app.background:
        frame_view()
    export()
    meshes = sum(1 for o in bpy.data.objects if o.type == "MESH")
    print(f"bairro: {meshes} malhas, {len(bpy.data.actions)} actions -> {RAW_GLB} ({os.path.getsize(RAW_GLB) // 1024} kB)")


main()
