"""
미리보기 렌더링 (Blender Cycles, CPU) — 모델 확인용 그림을 docs/images/ 에 저장
  python tools/blender/render_preview.py
"""

import math
import sys
from pathlib import Path

import bpy
import mathutils

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_car  # noqa: E402
from common import finish  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "docs" / "images"


def setup_render(w=1280, h=720, samples=24):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "JPEG"  # 렌더 노이즈 때문에 PNG 는 너무 큼
    sc.render.image_settings.quality = 85
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.82, 0.86, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sc.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30))
    sc.collection.objects.link(sun)
    # 지면
    bpy.ops.mesh.primitive_plane_add(size=40)
    g = bpy.context.active_object
    g.data.materials.append(build_car.material("Ground", "#6b7280", 0.9))


def camera(loc, target, lens=40, ortho=None):
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_end = 10000  # 기본 100 m 이면 서킷 전체를 위에서 볼 때 잘린다
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens
    bpy.context.scene.camera = cam
    return cam


def pose(front=0.0, rear=0.0, diffuser=0.0, ride_mm=30):
    """셋업 각도(도) 적용: Blender 에서는 +Y 축 회전 (rotation_euler[1])"""
    o = bpy.data.objects
    o["FrontWing_Flap_Pivot"].rotation_euler[1] = math.radians(front)
    o["RearWing_Flap_Pivot"].rotation_euler[1] = math.radians(rear)
    o["Diffuser_Pivot"].rotation_euler[1] = math.radians(diffuser)
    o["Chassis"].location.z = ride_mm / 1000


def render(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("렌더:", path)


if __name__ == "__main__":
    IMG.mkdir(parents=True, exist_ok=True)
    build_car.build()
    setup_render()
    pose(front=8, rear=8, diffuser=12)
    camera((5.2, 4.6, 2.4), (0, 0, 0.35), lens=35)
    render(IMG / "car_three_quarter.jpg")
    # 측면: 윙 각도 비교 (0° vs 20°)
    camera((0, 9, 0.55), (0, 0, 0.45), ortho=6.6)
    for ang in (0, 20):
        pose(front=ang, rear=ang, diffuser=ang)
        render(IMG / f"car_side_{ang}deg.jpg")
    # 각도 확인용: 끝판·바퀴를 숨기고 리어 윙·디퓨저 확대 (차 뒤쪽이 화면 오른쪽)
    for o in bpy.data.objects:
        if "Endplate" in o.name or "Fence" in o.name or o.name.startswith(("Tyre", "Rim", "Arm")):
            o.hide_render = True
    camera((-2.1, 6, 0.6), (-2.1, 0, 0.6), ortho=1.9)
    for ang in (0, 20):
        pose(front=ang, rear=ang, diffuser=ang)
        render(IMG / f"check_rear_{ang}deg.jpg")
    camera((2.7, 6, 0.18), (2.7, 0, 0.18), ortho=1.1)
    for ang in (0, 20):
        pose(front=ang, rear=ang, diffuser=ang)
        render(IMG / f"check_front_{ang}deg.jpg")
    finish()
