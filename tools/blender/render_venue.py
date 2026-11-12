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
    # 터널: 바깥(위에서 비스듬히)과 안(차 뒤 시점). 차를 터널 안(중심선 점 160)으로 옮긴다
    car = bpy.data.objects["Car"]
    k = 160
    (x0, y0, *_), (x1, y1, *_) = raw[k], raw[k + 1]
    car.location = (x0, y0, raw[k][4])
    car.rotation_euler = (0, 0, math.atan2(y1 - y0, x1 - x0))
    at(raw, 150, 0.0, 120, 160, 120, 60)  # 바다 쪽 위에서 터널 전체
    render(IMG / "venue_monaco_tunnel_outside.jpg")
    # 터널 안 확인용: 미리보기 렌더러(Cycles)는 좁은 터널 안까지 햇빛이 들지 않아 어두우므로,
    # 이 그림에만 천장 조명 위치에 점광원을 더한다 (모델 파일에는 넣지 않음. 웹 화면은 주변광으로 밝힘)
    for i in range(k - 30, k + 30, 4):
        pl = bpy.data.objects.new(f"PL{i}", bpy.data.lights.new(f"PL{i}", "POINT"))
        pl.data.energy = 900
        pl.location = (raw[i][0], raw[i][1], raw[i][4] + 5.5)
        bpy.context.scene.collection.objects.link(pl)
    bpy.context.scene.cycles.samples = 64
    at(raw, k, 0, 10, 0, 2.6, 60)
    render(IMG / "venue_monaco_tunnel_inside.jpg")
    finish()
