"""
서킷 미리보기 렌더링: 전체 모습, 첫 시케인 확대, 출발선 위의 차
  python tools/blender/render_track.py   (먼저 build_car.py 로 public/models/car.glb 를 만들어 둘 것)
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_track  # noqa: E402
from common import finish  # noqa: E402
from render_preview import camera, render, setup_render  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "docs" / "images"

if __name__ == "__main__":
    raw = build_track.build()
    setup_render(1280, 960, 16)
    bpy.data.objects["Plane"].hide_render = True  # setup_render 의 회색 바닥 숨김 (잔디가 있음)
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), (max(ys) - min(ys)) * 1280 / 960) * 1.08
    camera((cx, cy, 3000), (cx, cy + 0.01, 0), ortho=span)
    render(IMG / "track_overview.jpg")

    # 첫 시케인 (데이터 기준 약 900 m 지점 = 점 180 근처) 확대
    x, y = raw[184][0], raw[184][1]
    camera((x, y, 400), (x, y + 0.01, 0), ortho=160)
    render(IMG / "track_chicane1.jpg")

    # 메인 직선·출발선 주변 (관중석 위치 확인)
    xm, ym = raw[60][0], raw[60][1]
    camera((xm, ym, 1200), (xm, ym + 0.01, 0), ortho=900)
    render(IMG / "track_main_straight.jpg")

    # 출발선 위의 차: 진행 방향으로 차를 돌려 놓는다
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / "car.glb"))
    car = bpy.data.objects["Car"]
    (x0, y0, *_), (x1, y1, *_) = raw[3], raw[4]
    heading = math.atan2(y1 - y0, x1 - x0)
    car.location = (x0, y0, 0)
    car.rotation_mode = "XYZ"
    car.rotation_euler = (0, 0, heading)
    bpy.context.scene.render.resolution_y = 720
    back = (x0 - 9 * math.cos(heading) + 4 * math.sin(heading), y0 - 9 * math.sin(heading) - 4 * math.cos(heading), 2.6)
    camera(back, (x0, y0, 0.4), lens=32)
    render(IMG / "track_car_start.jpg")
    finish()
