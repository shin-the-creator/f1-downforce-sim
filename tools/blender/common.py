"""
Blender 스크립트 공통 도구 (bpy)

좌표 규칙 (Blender, 단위 m, Z 가 위)
  차:   +X = 앞(코), +Y = 왼쪽, +Z = 위. 원점 = 앞·뒤 차축의 가운데, 지면 높이.
  서킷: 데이터의 (x, y) 를 그대로 Blender (X, Y) 로, 지면 Z = 0.

glTF 로 내보내면 Y 가 위인 좌표로 바뀐다:  Blender (x, y, z) → glTF/Three.js (x, z, −y)
  → Blender 의 +Y 축 회전은 Three.js 에서 −Z 축 회전이 된다.
"""

import math

import bpy  # bpy 를 먼저 불러와야 bmesh 를 쓸 수 있다
import bmesh  # noqa: E402


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def material(name: str, rgb_hex: str, roughness: float = 0.5, metallic: float = 0.0) -> bpy.types.Material:
    """단색 PBR 재질 (glTF 로 그대로 내보내짐)"""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    h = rgb_hex.lstrip("#")
    # sRGB → 선형 색 공간 (Blender 재질은 선형 값을 쓴다)
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    mat.diffuse_color = (*lin, 1.0)
    return mat


def mesh_object(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None, parent=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if parent:
        obj.parent = parent
    return obj


def empty(name: str, location=(0.0, 0.0, 0.0), parent=None, extras: dict | None = None):
    """빈 물체 (회전축·부착점용). extras 는 glTF 의 extras 로 내보내진다."""
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.1
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    for k, v in (extras or {}).items():
        obj[k] = v
    return obj


def box(name: str, center, size, mat=None, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * size[0] + center[0]
        v.co.y = v.co.y * size[1] + center[1]
        v.co.z = v.co.z * size[2] + center[2]
    return mesh_object(name, bm, mat, parent)


def loft(name: str, sections, mat=None, parent=None, n_around: int = 16, smooth=True):
    """
    단면을 이어 붙인 몸체. sections = [(x, 반폭, 위 z, 아래 z, 지수), ...] (앞 → 뒤)
    단면은 초타원 |y/a|^p + |z/b|^p = 1 (p 가 클수록 각진 사각형에 가까움).
    양 끝은 뚜껑을 닫는다.
    """
    bm = bmesh.new()
    rings = []
    for x, hw, top, bot, p in sections:
        zc = (top + bot) / 2
        hz = (top - bot) / 2
        ring = []
        for k in range(n_around):
            t = 2 * math.pi * k / n_around
            c, s = math.cos(t), math.sin(t)
            y = hw * math.copysign(abs(c) ** (2 / p), c)
            z = zc + hz * math.copysign(abs(s) ** (2 / p), s)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(n_around):
            bm.faces.new((a[k], a[(k + 1) % n_around], b[(k + 1) % n_around], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return mesh_object(name, bm, mat, parent, smooth)


def naca4(code: str = "4412", n: int = 24, inverted: bool = True):
    """NACA 4자리 단면 (시위 1, 닫힌 뒤끝, 코사인 간격). 반환: 앞전에서 시작하는 닫힌 점열 [(x, y)]"""
    m, p, t = int(code[0]) / 100, int(code[1]) / 10, int(code[2:]) / 100
    up, lo = [], []
    for i in range(n + 1):
        x = 0.5 * (1 - math.cos(math.pi * i / n))
        if m == 0:
            yc, dyc = 0.0, 0.0
        elif x < p:
            yc, dyc = m / p**2 * (2 * p * x - x**2), 2 * m / p**2 * (p - x)
        else:
            yc, dyc = m / (1 - p) ** 2 * (1 - 2 * p + 2 * p * x - x**2), 2 * m / (1 - p) ** 2 * (p - x)
        yt = 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
        th = math.atan(dyc)
        up.append((x - yt * math.sin(th), yc + yt * math.cos(th)))
        lo.append((x + yt * math.sin(th), yc - yt * math.cos(th)))
    if inverted:
        up, lo = [(x, -y) for x, y in lo], [(x, -y) for x, y in up]
    # 앞전 → 윗면 → 뒤끝 → 아랫면 → 앞전 (뒤끝 중복점 제거)
    return up + list(reversed(lo[1:-1]))


def wing(name: str, chord: float, half_span: float, mat=None, parent=None, code="4412"):
    """
    윙 한 장: NACA 단면을 폭 방향(Y)으로 밀어낸 것.
    물체 원점 = 1/4 시위점 (회전축). 앞전은 +X 쪽 (원점에서 +0.25c), 뒤끝은 −0.75c.
    역방향 단면이라 아래가 볼록 → 아래쪽이 저압 = 다운포스.
    """
    prof = naca4(code)
    bm = bmesh.new()
    rings = []
    for y in (-half_span, half_span):
        rings.append([bm.verts.new(((0.25 - px) * chord, y, py * chord)) for px, py in prof])
    a, b = rings
    n = len(prof)
    for k in range(n):
        bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    return mesh_object(name, bm, mat, parent, smooth=True)


def cylinder_y(name: str, center, radius: float, width: float, mat=None, parent=None, segments: int = 24):
    """Y 축 방향 원기둥 (바퀴)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=width)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "X"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return mesh_object(name, bm, mat, parent, smooth=True)


def tube(name: str, points, radius: float, mat=None, parent=None, sides: int = 8):
    """점들을 잇는 관 (헤일로, 서스펜션 암)"""
    import mathutils

    bm = bmesh.new()
    rings = []
    for i, p in enumerate(points):
        p = mathutils.Vector(p)
        a = mathutils.Vector(points[max(i - 1, 0)])
        b = mathutils.Vector(points[min(i + 1, len(points) - 1)])
        t = (b - a).normalized()
        ref = mathutils.Vector((0, 0, 1)) if abs(t.z) < 0.9 else mathutils.Vector((1, 0, 0))
        u = t.cross(ref).normalized()
        w = t.cross(u).normalized()
        rings.append([bm.verts.new(p + radius * (math.cos(2 * math.pi * k / sides) * u + math.sin(2 * math.pi * k / sides) * w)) for k in range(sides)])
    for r1, r2 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r1[k], r1[(k + 1) % sides], r2[(k + 1) % sides], r2[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return mesh_object(name, bm, mat, parent, smooth=True)


def export_glb(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
