"""
가상 F1 스타일 차 3D 모델 만들기 (Blender, bpy)
===============================================

실제 팀·차를 본뜨지 않은 가상의 로우폴리 디자인이다. 로고·스폰서 없음.
치수는 2026 규정 보도값(휠베이스 약 3.4 m, 전체 폭 약 1.9 m)에 대략 맞춘 디자인용 근사값이다.

움직이는 부품 (3D 화면에서 셋업 값대로 돌린다)
  FrontWing_Main_Pivot  프런트 윙 각도   (Blender +Y 축 회전, + = 앞전 아래로 = 다운포스 증가)
  FrontWing_Flap_Pivot  프런트 플랩      (액티브 에어로: Straight Mode 에서 눕힘)
  RearWing_Main_Pivot   리어 윙 각도
  RearWing_Flap_Pivot   리어 플랩
  Diffuser_Pivot        디퓨저 확장각    (+ = 뒤끝이 위로)
  Chassis               차고            (Z 위치 = 차고, 바퀴는 따라 움직이지 않음)
  Wheel_FL/FR/RL/RR     바퀴            (Y 축 회전 = 굴러감)
  Anchor_*              힘 화살표 부착점

각 회전축에는 glTF extras 로 {role, axis, sign} 을 넣는다. Three.js 에서
  object.rotation[axis] = sign × 각도(rad)
로 쓰면 "+ = 앞전 아래로" 가 된다 (Blender +Y 회전 → glTF −Z 회전이므로 axis "z", sign −1).

실행:  python tools/blender/build_car.py   (bpy 4.2, Python 3.11)
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import box, cylinder_y, empty, export_glb, finish, loft, material, reset_scene, tube, wing  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "models" / "car.glb"

# ── 치수 (m) — 디자인용 근사값 ─────────────────────────────────────
WHEELBASE = 3.4
TRACK = 1.6  # 좌우 바퀴 중심 사이
TYRE_R_F, TYRE_W_F = 0.36, 0.30
TYRE_R_R, TYRE_W_R = 0.36, 0.36
REF_RIDE_HEIGHT = 0.030  # 모델을 만든 기준 차고 (m) — Chassis.z 로 바꾼다
XF, XR = WHEELBASE / 2, -WHEELBASE / 2

ROT = {"axis": "z", "sign": -1}  # Blender +Y 회전 = Three.js −Z 회전


def build() -> None:
    reset_scene()
    body_c = material("Body_Teal", "#0f766e", 0.35, 0.1)
    accent = material("Accent_White", "#f1f5f9", 0.4)
    carbon = material("Carbon", "#111827", 0.6)
    flap_c = material("Flap_Orange", "#f97316", 0.4)
    tyre_c = material("Tyre", "#0b0b0c", 0.9)
    rim_c = material("Rim", "#9ca3af", 0.3, 0.8)
    helmet_c = material("Helmet", "#facc15", 0.3)

    car = empty("Car", extras={"role": "carRoot", "note": "가상 디자인, 원점 = 차축 가운데 지면"})
    chassis = empty("Chassis", (0, 0, REF_RIDE_HEIGHT), car, {"role": "rideHeight", "axis": "y", "refRideHeight_m": REF_RIDE_HEIGHT})

    # ── 몸체 (모노코크 + 노즈 + 엔진 커버) : 단면 (x, 반폭, 위z, 아래z, 초타원 지수) ──
    loft(
        "Body",
        [
            (2.60, 0.06, 0.28, 0.20, 2.2),
            (2.25, 0.12, 0.38, 0.16, 2.4),
            (1.70, 0.20, 0.52, 0.12, 2.6),
            (1.00, 0.30, 0.64, 0.06, 3.0),
            (0.30, 0.38, 0.68, 0.04, 3.2),
            (-0.20, 0.40, 0.92, 0.04, 3.0),
            (-0.80, 0.32, 0.84, 0.05, 2.8),
            (-1.40, 0.22, 0.62, 0.08, 2.6),
            (-2.00, 0.12, 0.42, 0.12, 2.4),
            (-2.30, 0.06, 0.30, 0.16, 2.2),
        ],
        body_c,
        chassis,
        n_around=20,
    )
    # 사이드포드 (좌우)
    for side, s in (("L", 1), ("R", -1)):
        sp = loft(
            f"Sidepod_{side}",
            [
                (0.55, 0.10, 0.42, 0.10, 3.5),
                (0.30, 0.20, 0.46, 0.04, 3.5),
                (-0.40, 0.20, 0.42, 0.04, 3.2),
                (-1.20, 0.12, 0.30, 0.06, 2.8),
                (-1.60, 0.05, 0.18, 0.08, 2.4),
            ],
            body_c,
            chassis,
            n_around=16,
        )
        sp.location.y = s * 0.52
        # 흰색 줄무늬 (가상 도색)
        box(f"Stripe_{side}", (-0.2, s * 0.722, 0.40), (0.9, 0.004, 0.05), accent, chassis)

    # 조종석 + 헬멧
    box("Cockpit", (0.30, 0, 0.655), (0.60, 0.34, 0.03), carbon, chassis)
    loft("Helmet", [(0.32, 0.01, 0.80, 0.78, 2), (0.24, 0.11, 0.88, 0.66, 2), (0.10, 0.12, 0.88, 0.66, 2), (0.00, 0.02, 0.80, 0.74, 2)], helmet_c, chassis, 12)

    # 헤일로 (조종사 보호 장치): 앞 기둥 + 헬멧을 감싸는 U자 고리
    tube("Halo_Pillar", [(0.74, 0, 0.64), (0.68, 0, 0.84), (0.62, 0, 0.95)], 0.024, carbon, chassis)
    left = [(0.62, 0.0, 0.95), (0.50, 0.15, 0.96), (0.34, 0.24, 0.95), (0.14, 0.27, 0.93), (-0.04, 0.28, 0.88), (-0.12, 0.28, 0.72)]
    right = [(x, -y, z) for x, y, z in reversed(left)]
    tube("Halo_Ring", right[:-1] + left, 0.024, carbon, chassis)

    # ── 바닥 + 디퓨저 ──
    box("Floor", (-0.20, 0, 0.010), (2.80, 1.50, 0.020), carbon, chassis)
    diff = empty("Diffuser_Pivot", (-1.60, 0, 0.020), chassis, {"role": "diffuser", **ROT, "note": "+ = 뒤끝이 위로 (확장각)"})
    # 피벗 기준 좌표: 뒤로(−X) 0.7 m 뻗은 판 + 좌우 벽
    box("Diffuser_Ramp", (-0.35, 0, 0.005), (0.70, 1.00, 0.010), carbon, diff)
    for side, s in (("L", 1), ("R", -1)):
        box(f"Diffuser_Fence_{side}", (-0.35, s * 0.50, 0.06), (0.70, 0.01, 0.12), carbon, diff)
    empty("Anchor_Floor", (-0.6, 0, 0.0), chassis, {"role": "anchor", "part": "floor"})

    # ── 프런트 윙 ──
    fw_main = empty("FrontWing_Main_Pivot", (2.95 - 0.25 * 0.30, 0, 0.10), chassis, {"role": "frontWing", **ROT})
    wing("FrontWing_Main", 0.30, 0.82, carbon, fw_main)
    # 플랩: 주 날개 뒤끝 근처가 회전축 (플랩 앞전)
    fw_flap = empty("FrontWing_Flap_Pivot", (-0.75 * 0.30 + 0.02, 0, 0.022), fw_main, {"role": "frontFlap", **ROT})
    flap = wing("FrontWing_Flap", 0.18, 0.80, flap_c, fw_flap)
    flap.location.x = -0.25 * 0.18  # 플랩 앞전이 피벗에 오도록
    for side, s in (("L", 1), ("R", -1)):
        box(f"FrontWing_Endplate_{side}", (2.68, s * 0.84, 0.14), (0.62, 0.012, 0.24), accent, chassis)
    box("FrontWing_Pylon", (2.55, 0, 0.17), (0.10, 0.04, 0.14), carbon, chassis)
    empty("Anchor_FrontWing", (2.75, 0, 0.12), chassis, {"role": "anchor", "part": "frontWing"})

    # ── 리어 윙 ──
    rw_main = empty("RearWing_Main_Pivot", (-2.05 - 0.25 * 0.30, 0, 0.80), chassis, {"role": "rearWing", **ROT})
    wing("RearWing_Main", 0.30, 0.50, carbon, rw_main)
    rw_flap = empty("RearWing_Flap_Pivot", (-0.75 * 0.30 + 0.02, 0, 0.028), rw_main, {"role": "rearFlap", **ROT})
    rflap = wing("RearWing_Flap", 0.20, 0.49, flap_c, rw_flap)
    rflap.location.x = -0.25 * 0.20
    for side, s in (("L", 1), ("R", -1)):
        box(f"RearWing_Endplate_{side}", (-2.28, s * 0.515, 0.68), (0.62, 0.012, 0.58), accent, chassis)
    box("RearWing_Pylon", (-2.10, 0, 0.55), (0.12, 0.04, 0.50), carbon, chassis)
    empty("Anchor_RearWing", (-2.20, 0, 0.85), chassis, {"role": "anchor", "part": "rearWing"})
    empty("Anchor_CoG", (0.0, 0, 0.30), chassis, {"role": "anchor", "part": "centerOfGravity"})

    # ── 바퀴 (Car 에 붙임: 차고를 바꿔도 지면에 그대로) ──
    for name, x, y, r, w in (
        ("FL", XF, TRACK / 2, TYRE_R_F, TYRE_W_F),
        ("FR", XF, -TRACK / 2, TYRE_R_F, TYRE_W_F),
        ("RL", XR, TRACK / 2, TYRE_R_R, TYRE_W_R),
        ("RR", XR, -TRACK / 2, TYRE_R_R, TYRE_W_R),
    ):
        wheel = empty(f"Wheel_{name}", (x, y, r), car, {"role": "wheel", "axis": "z", "radius_m": r})
        cylinder_y(f"Tyre_{name}", (0, 0, 0), r, w, tyre_c, wheel)
        cylinder_y(f"Rim_{name}", (0, (0.002 if y > 0 else -0.002), 0), r * 0.62, w + 0.004, rim_c, wheel, 16)
        # 서스펜션 암 (차체 → 바퀴): 차체 쪽 끝은 Chassis 기준이라 차고가 바뀌면 살짝 어긋나지만 연출용
        sgn = 1 if y > 0 else -1
        tube(f"Arm_Upper_{name}", [(x, sgn * 0.25, 0.42), (x, y - sgn * w / 2, r + 0.08)], 0.012, carbon, car)
        tube(f"Arm_Lower_{name}", [(x, sgn * 0.25, 0.18), (x, y - sgn * w / 2, r - 0.10)], 0.012, carbon, car)



if __name__ == "__main__":
    build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    export_glb(str(OUT))
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"저장: {OUT} ({OUT.stat().st_size / 1024:.0f} KB, 면 {tris}개, 물체 {len(bpy.data.objects)}개)")
    finish()
