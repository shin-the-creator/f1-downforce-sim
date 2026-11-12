"""
경기장 디테일 미리보기: 서킷 + 경기장(OSM) + 차
  python tools/blender/render_venue.py   (build_car.py, build_track.py, build_venue.py 를 먼저 실행)
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
M = ROOT / "public" / "models"


def scene(tid):
    raw = build_track.build(tid)
    setup_render(1280, 720, 20)
    bpy.data.objects["Plane"].hide_render = True
    bpy.ops.import_scene.gltf(filepath=str(M / f"{tid}_venue.glb"))
    bpy.ops.import_scene.gltf(filepath=str(M / "car.glb"))
    car = bpy.data.objects["Car"]
    (x0, y0, *_), (x1, y1, *_) = raw[3], raw[4]
    h = math.atan2(y1 - y0, x1 - x0)
    car.location = (x0, y0, raw[3][4])
    car.rotation_mode = "XYZ"
    car.rotation_euler = (0, 0, h)
    return raw, h


def at(raw, i, h_off, back, side, up, ahead=40.0):
    """중심선 점 i 기준 카메라: 진행 방향 뒤로 back, 옆으로 side, 위로 up 에서 앞쪽 ahead m 를 본다"""
    x, y, *_, z = raw[i]
    a, b = raw[(i + 1) % len(raw)], raw[i]
    hh = math.atan2(a[1] - b[1], a[0] - b[0]) + h_off
    c, s = math.cos(hh), math.sin(hh)
    camera((x - back * c - side * s, y - back * s + side * c, z + up), (x + ahead * c, y + ahead * s, z), lens=30)


if __name__ == "__main__":
    raw, _ = scene("monza")
    at(raw, 2, 0, 60, -45, 28, 260)  # 출발선 뒤 높은 곳에서 메인 직선·관중석
    render(IMG / "venue_monza_main_straight.jpg")
    at(raw, 1040, 0, 120, 140, 90, 120)  # 파라볼리카 (데이터 기준 약 5.2 km)
    render(IMG / "venue_monza_parabolica.jpg")
    raw, _ = scene("monaco")
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    zc = sum(p[4] for p in raw) / len(raw)
    camera((cx + 500, cy - 700, zc + 380), (cx, cy, zc), lens=35)
    render(IMG / "venue_monaco_aerial.jpg")
    at(raw, 3, 0, 12, 0, 4, 60)  # 차 뒤 낮은 시점
    render(IMG / "venue_monaco_street.jpg")
    finish()
