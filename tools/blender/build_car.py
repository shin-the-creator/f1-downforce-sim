"""
가상 F1 스타일 차 3D 모델 만들기 (Blender, bpy)
===============================================

실제 팀·차를 본뜨지 않은 가상 디자인이다 (로고·스폰서 없음).
치수는 2026 규정 보도값(휠베이스 약 3.4 m, 전체 폭 약 1.9 m)에 대략 맞춘 디자인용 근사값이다.

실제 F1 처럼 부품이 서로 붙어 있게 만든다
  - 노즈 끝은 프런트 윙 메인플레인 위에 얹힌다
  - 프런트 윙 3장(메인 + 플랩 2장)과 리어 윙 2장(메인 + 플랩)은 양쪽 엔드플레이트 사이에 끼워진다
  - 리어 윙은 기어박스 위 충돌 구조물에서 올라온 스완넥 기둥이 받친다
  - 셋업에서 바뀌는 윙 각도는 실제 F1 처럼 "플랩" 각도로 보여 준다 (메인플레인은 고정)

움직이는 부품 (glTF extras: role, axis, sign → Three.js 에서 rotation[axis] = sign × 각도)
  FrontWing_Flap_Pivot  프런트 윙 각도 (+ = 플랩 앞전 아래로 → 다운포스 증가)
  RearWing_Flap_Pivot   리어 윙 각도
  Diffuser_Pivot        디퓨저 확장각 (+ = 뒤끝이 위로)
  Chassis               차고 (position.y), 바퀴는 따라 움직이지 않음
  Wheel_FL/FR/RL/RR     바퀴 (rotation.z = 굴러감)
  Anchor_*              힘 화살표 부착점
  색 구역: 모든 부품에 extras.colorZone (body, accent, flap, carbon, helmet, rim, tyre, fixed)

실행:  python tools/blender/build_car.py   (bpy 4.2, Python 3.11)
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    box,
    cylinder_y,
    empty,
    export_glb,
    finish,
    loft2,
    material,
    plate,
    reset_scene,
    side_plate,
    smooth_by_angle,
    tube,
    tyre,
    wing,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "models" / "car.glb"

# ── 치수 (m) — 디자인용 근사값 ─────────────────────────────────────
WHEELBASE = 3.4
HALF_TRACK = 0.775  # 바퀴 중심의 좌우 거리 (전체 폭 ≈ 2 × (0.775 + 타이어 반폭) ≈ 1.91 m)
TYRE_R = 0.36  # 타이어 반지름 (지름 약 0.72 m)
RIM_R = 0.23  # 18인치 휠 (지름 약 0.46 m)
TYRE_W_F, TYRE_W_R = 0.30, 0.36
REF_RIDE_HEIGHT = 0.030  # 모델 기준 차고 (m)
XF, XR = WHEELBASE / 2, -WHEELBASE / 2
ZW = TYRE_R - REF_RIDE_HEIGHT  # Chassis 좌표에서 바퀴 중심 높이

ROT = {"axis": "z", "sign": -1}  # Blender +Y 축 회전 = Three.js −Z 축 회전

# 색 구역: 화면에서 플레이어가 부위별로 색을 바꿀 수 있게, 재질 이름 → 구역 이름을 glTF extras 로 남긴다.
# 같은 구역의 부품은 같은 재질을 공유하므로, Three.js 에서 재질 색 하나만 바꾸면 그 구역 전체가 바뀐다.
COLOR_ZONES = {
    "Body_Teal": "body",  # 차체 주색: 모노코크·노즈·엔진 커버·사이드포드·미러·샤크핀
    "Accent_White": "accent",  # 포인트색: 엔드플레이트·줄무늬
    "Flap_Orange": "flap",  # 윙 플랩
    "Carbon": "carbon",  # 카본 부품: 메인플레인·바닥·디퓨저·헤일로·서스펜션
    "Helmet": "helmet",
    "Rim": "rim",
    "Tyre": "tyre",
    "Inlet_Dark": "fixed",  # 흡입구·조종석 (색 고정)
    "Rain_Light": "fixed",
}


def build() -> None:
    reset_scene()
    teal = material("Body_Teal", "#0e7c74", 0.32, 0.15)
    white = material("Accent_White", "#eef2f6", 0.4)
    carbon = material("Carbon", "#15171c", 0.55, 0.1)
    dark = material("Inlet_Dark", "#050506", 0.9)
    flap_c = material("Flap_Orange", "#f2662a", 0.4)
    tyre_c = material("Tyre", "#121214", 0.92)
    rim_c = material("Rim", "#8a9099", 0.3, 0.85)
    helmet_c = material("Helmet", "#f5c518", 0.3)
    red = material("Rain_Light", "#e11d2a", 0.3)

    car = empty("Car", extras={"role": "carRoot", "note": "가상 디자인. 원점 = 앞·뒤 차축 가운데의 지면"})
    ch = empty("Chassis", (0, 0, REF_RIDE_HEIGHT), car, {"role": "rideHeight", "axis": "y", "refRideHeight_m": REF_RIDE_HEIGHT})
    parts = []

    # ── 노즈 + 모노코크 (한 덩어리) : (x, 반폭, 위, 아래, 위 지수, 아래 지수) ──
    # 노즈 아래는 평평하고(아래 지수 큼), 끝(x = 2.86)은 프런트 윙 메인플레인 윗면(z ≈ 0.11)에 닿는다.
    parts.append(
        loft2(
            "Monocoque",
            [
                # 노즈: 윗면 지수 4 대 → 둥근 원통이 아니라 윗면이 평평하고 모서리에 살짝 각이 선 단면
                (2.86, 0.058, 0.185, 0.105, 4.0, 8),
                (2.60, 0.088, 0.255, 0.115, 4.2, 8),
                (2.20, 0.128, 0.365, 0.135, 4.4, 8),
                (1.80, 0.172, 0.465, 0.155, 4.4, 8),
                (1.45, 0.222, 0.555, 0.170, 4.2, 8),
                (1.15, 0.270, 0.600, 0.090, 3.6, 8),
                (0.80, 0.320, 0.630, 0.030, 4.0, 10),
                (0.40, 0.360, 0.660, 0.015, 4.0, 10),
                (0.00, 0.380, 0.680, 0.015, 4.0, 10),
                (-0.35, 0.380, 0.690, 0.015, 4.0, 10),
            ],
            teal,
            ch,
            28,
        )
    )
    # 조종석 구멍(검은 판), 헬멧
    parts.append(plate("Cockpit_Opening", [(0.78, 0.0), (0.66, 0.19), (0.10, 0.25), (-0.05, 0.22), (-0.05, -0.22), (0.10, -0.25), (0.66, -0.19)], 0.655, 0.672, dark, ch))
    parts.append(loft2("Helmet", [(0.32, 0.02, 0.80, 0.76, 2, 2), (0.27, 0.10, 0.88, 0.68, 2, 2), (0.15, 0.125, 0.90, 0.66, 2, 2), (0.03, 0.10, 0.87, 0.68, 2, 2), (-0.02, 0.02, 0.80, 0.74, 2, 2)], helmet_c, ch, 16))
    parts.append(box("Helmet_Visor", (0.265, 0, 0.835), (0.05, 0.19, 0.028), dark, ch))

    # ── 엔진 커버 (에어박스 → 기어박스·충돌 구조물까지) ──
    parts.append(
        loft2(
            "Engine_Cover",
            [
                (0.02, 0.06, 0.86, 0.70, 2.2, 4),  # 헬멧 뒤 롤 후프에서 가늘게 시작
                (-0.08, 0.15, 0.95, 0.62, 2.4, 6),
                (-0.40, 0.25, 0.93, 0.45, 2.6, 6),
                (-0.90, 0.27, 0.80, 0.18, 2.8, 6),
                (-1.40, 0.20, 0.62, 0.18, 2.8, 6),
                (-1.80, 0.13, 0.47, 0.20, 2.8, 6),
                (-2.20, 0.085, 0.37, 0.22, 3.0, 6),
                (-2.46, 0.05, 0.32, 0.24, 3.0, 6),
            ],
            teal,
            ch,
            24,
        )
    )
    parts.append(box("Airbox_Inlet", (-0.07, 0, 0.865), (0.012, 0.14, 0.09), dark, ch))
    # 샤크핀 (엔진 커버 위 세로 판)
    parts.append(side_plate("Shark_Fin", [(-0.45, 0.91), (-0.45, 0.96), (-1.85, 0.66), (-1.85, 0.46)], -0.004, 0.004, teal, ch))
    parts.append(box("Rain_Light", (-2.47, 0, 0.27), (0.02, 0.07, 0.035), red, ch))

    # ── 사이드포드: 흡입구 + 아래가 파인 언더컷 + 뒤로 갈수록 낮아짐 ──
    for side, s in (("L", 1), ("R", -1)):
        yc = s * 0.56
        parts.append(
            loft2(
                f"Sidepod_{side}",
                [
                    (0.56, 0.14, 0.50, 0.24, 6, 4, yc),
                    (0.36, 0.17, 0.52, 0.15, 6, 3, yc),
                    (-0.10, 0.17, 0.48, 0.11, 5, 3, yc),
                    (-0.70, 0.13, 0.38, 0.08, 4, 3, s * 0.52),
                    (-1.20, 0.08, 0.28, 0.06, 3, 3, s * 0.45),
                    (-1.50, 0.04, 0.20, 0.05, 3, 3, s * 0.40),
                ],
                teal,
                ch,
                24,
            )
        )
        parts.append(box(f"Sidepod_Inlet_{side}", (0.565, yc, 0.37), (0.01, 0.22, 0.20), dark, ch))
        parts.append(side_plate(f"Stripe_Pod_{side}", [(0.30, 0.47), (-0.60, 0.36), (-0.60, 0.33), (0.30, 0.43)], s * 0.728, s * 0.731, white, ch))
        # 미러 (지지대 + 하우징)
        parts.append(tube(f"Mirror_Stalk_{side}", [(0.58, s * 0.36, 0.62), (0.58, s * 0.50, 0.68)], 0.010, carbon, ch))
        parts.append(box(f"Mirror_{side}", (0.56, s * 0.55, 0.69), (0.06, 0.13, 0.05), teal, ch))

    # ── 헤일로: 앞 기둥 + 헬멧을 감싸는 고리, 뒤쪽 두 다리는 모노코크에 고정 ──
    parts.append(tube("Halo_Pillar", [(0.80, 0, 0.63), (0.73, 0, 0.84), (0.63, 0, 0.92)], 0.028, carbon, ch))
    left = [(0.63, 0.0, 0.92), (0.50, 0.16, 0.93), (0.30, 0.25, 0.92), (0.10, 0.27, 0.89), (-0.03, 0.27, 0.82), (-0.07, 0.27, 0.68)]
    parts.append(tube("Halo_Ring", [(x, -y, z) for x, y, z in reversed(left)][:-1] + left, 0.028, carbon, ch, 10))

    # ── 바닥: 넓은 판 + 가장자리 립 + 디퓨저(회전) ──
    floor_outline = [(1.25, 0.30), (1.05, 0.62), (0.70, 0.80), (-1.20, 0.80), (-1.40, 0.62), (-1.55, 0.52), (-1.55, -0.52), (-1.40, -0.62), (-1.20, -0.80), (0.70, -0.80), (1.05, -0.62), (1.25, -0.30)]
    parts.append(plate("Floor", floor_outline, 0.0, 0.012, carbon, ch))
    for side, s in (("L", 1), ("R", -1)):
        parts.append(side_plate(f"Floor_Edge_{side}", [(0.70, 0.012), (-1.20, 0.012), (-1.20, 0.055), (0.70, 0.035)], s * 0.79, s * 0.80, carbon, ch))
    diff = empty("Diffuser_Pivot", (-1.55, 0, 0.012), ch, {"role": "diffuser", **ROT, "note": "+ = 뒤끝이 위로 (확장각)"})
    parts.append(plate("Diffuser_Ramp", [(0.0, 0.52), (-0.55, 0.52), (-0.55, -0.52), (0.0, -0.52)], 0.0, 0.008, carbon, diff))
    for k, y in enumerate((0.52, 0.22, -0.22, -0.52)):
        parts.append(side_plate(f"Diffuser_Fence_{k}", [(0.0, 0.0), (-0.55, 0.0), (-0.55, 0.17), (0.0, 0.03)], y - 0.004, y + 0.004, carbon, diff))
    empty("Anchor_Floor", (-0.6, 0, 0.0), ch, {"role": "anchor", "part": "floor"})

    # ── 프런트 윙: 메인플레인(고정) + 플랩 2장(회전), 엔드플레이트에 끼워짐 ──
    FW_SPAN = 0.78  # 엔드플레이트 안쪽까지 반폭
    fw_main = wing("FrontWing_Main", 0.30, FW_SPAN, carbon, ch)
    fw_main.location = (3.02 - 0.075, 0, 0.085)  # 원점 = 1/4 시위점
    parts.append(fw_main)
    fw_flap = empty("FrontWing_Flap_Pivot", (3.02 - 0.30 + 0.03, 0, 0.122), ch, {"role": "frontWing", **ROT, "note": "플랩 앞전이 회전축"})
    f1 = wing("FrontWing_Flap1", 0.17, FW_SPAN, flap_c, fw_flap)
    f1.location = (-0.25 * 0.17, 0, 0)
    f2 = wing("FrontWing_Flap2", 0.13, FW_SPAN, flap_c, fw_flap)
    f2.location = (-0.17 + 0.03 - 0.25 * 0.13, 0, 0.034)
    f2.rotation_euler[1] = math.radians(8)  # 위쪽 플랩은 더 세운 상태 (고정)
    parts += [f1, f2]
    for side, s in (("L", 1), ("R", -1)):
        parts.append(side_plate(f"FrontWing_Endplate_{side}", [(3.06, 0.02), (2.40, 0.02), (2.40, 0.26), (2.60, 0.30), (3.06, 0.17)], s * FW_SPAN, s * (FW_SPAN + 0.012), white, ch))
        parts.append(plate(f"FrontWing_Footplate_{side}", [(3.06, s * FW_SPAN), (2.40, s * FW_SPAN), (2.40, s * (FW_SPAN + 0.07)), (3.06, s * (FW_SPAN + 0.05))], 0.02, 0.028, carbon, ch))
    empty("Anchor_FrontWing", (2.80, 0, 0.12), ch, {"role": "anchor", "part": "frontWing"})

    # ── 리어 윙: 메인(고정) + 플랩(회전), 엔드플레이트 사이 + 스완넥 기둥 ──
    RW_SPAN = 0.488
    rw_main = wing("RearWing_Main", 0.32, RW_SPAN, carbon, ch)
    rw_main.location = (-2.02 - 0.08, 0, 0.80)
    rw_main.rotation_euler[1] = math.radians(4)
    rw_flap = empty("RearWing_Flap_Pivot", (-2.02 - 0.32 + 0.035, 0, 0.845), ch, {"role": "rearWing", **ROT, "note": "플랩 앞전이 회전축"})
    rf = wing("RearWing_Flap", 0.20, RW_SPAN, flap_c, rw_flap)
    rf.location = (-0.05, 0, 0)
    parts += [rw_main, rf]
    for side, s in (("L", 1), ("R", -1)):
        parts.append(side_plate(f"RearWing_Endplate_{side}", [(-1.98, 0.99), (-2.60, 0.99), (-2.60, 0.55), (-2.42, 0.46), (-2.10, 0.56)], s * RW_SPAN, s * (RW_SPAN + 0.012), white, ch))
        # 스완넥 기둥 (좌우 두 장): 충돌 구조물 윗면 → 메인플레인 아랫면
        parts.append(side_plate(f"RearWing_Pylon_{side}", [(-2.05, 0.33), (-2.28, 0.33), (-2.32, 0.80), (-2.16, 0.80)], s * 0.05 - 0.005, s * 0.05 + 0.005, carbon, ch))
    empty("Anchor_RearWing", (-2.25, 0, 0.88), ch, {"role": "anchor", "part": "rearWing"})
    empty("Anchor_CoG", (0.0, 0, 0.30), ch, {"role": "anchor", "part": "centerOfGravity"})

    # ── 바퀴 (Car 에 붙임: 차고를 바꿔도 지면에 그대로) ──
    for name, x, s, w in (("FL", XF, 1, TYRE_W_F), ("FR", XF, -1, TYRE_W_F), ("RL", XR, 1, TYRE_W_R), ("RR", XR, -1, TYRE_W_R)):
        wheel = empty(f"Wheel_{name}", (x, s * HALF_TRACK, TYRE_R), car, {"role": "wheel", "axis": "z", "radius_m": TYRE_R})
        parts.append(tyre(f"Tyre_{name}", (0, 0, 0), TYRE_R, RIM_R, w, tyre_c, wheel))
        parts.append(cylinder_y(f"Rim_{name}", (0, 0, 0), RIM_R, w * 0.9, rim_c, wheel, 24))
        parts.append(cylinder_y(f"WheelCover_{name}", (0, s * w * 0.46, 0), RIM_R * 0.97, 0.01, carbon, wheel, 24))
        # 서스펜션 (Chassis 기준 좌표): 위·아래 위시본, 푸시로드(앞)·풀로드(뒤), 타이로드
        yu = s * (HALF_TRACK - w / 2 - 0.03)
        zu, zl = ZW + 0.16, ZW - 0.17
        if x > 0:
            arms = [
                ((x - 0.15, s * 0.22, 0.50), (x, yu, zu)),
                ((x - 0.50, s * 0.25, 0.48), (x, yu, zu)),
                ((x - 0.10, s * 0.22, 0.18), (x, yu, zl)),
                ((x - 0.55, s * 0.28, 0.15), (x, yu, zl)),
                ((x - 0.05, yu, zl + 0.02), (x - 0.25, s * 0.24, 0.50)),
                ((x + 0.10, s * 0.25, 0.30), (x + 0.08, yu, ZW)),
            ]
        else:
            arms = [
                ((x + 0.15, s * 0.20, 0.52), (x, yu, zu)),
                ((x - 0.15, s * 0.18, 0.50), (x, yu, zu)),
                ((x + 0.20, s * 0.30, 0.15), (x, yu, zl)),
                ((x - 0.20, s * 0.25, 0.16), (x, yu, zl)),
                ((x + 0.05, yu, zu - 0.02), (x + 0.30, s * 0.20, 0.20)),
            ]
        for k, (a, b) in enumerate(arms):
            parts.append(tube(f"Susp_{name}_{k}", [a, b], 0.011, carbon, ch, 6))
        parts.append(box(f"Upright_{name}", (x, yu, ZW), (0.10, 0.04, 0.34), carbon, ch))

    for o in parts:
        if o is not None and o.type == "MESH":
            smooth_by_angle(o, 30)
            o["colorZone"] = COLOR_ZONES[o.data.materials[0].name]


if __name__ == "__main__":
    build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    export_glb(str(OUT))
    faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"저장: {OUT} ({OUT.stat().st_size / 1024:.0f} KB, 면 {faces}개, 물체 {len(bpy.data.objects)}개)")
    finish()
