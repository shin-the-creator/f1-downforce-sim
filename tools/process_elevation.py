"""
고도 다듬기: 원본 고도(…_elevation.csv) → 물리·3D 가 함께 쓰는 고도(…_z.csv)
============================================================================

1) 값 고르기: EU-DEM(25 m, 유럽에서 더 정밀)을 쓰고, 빈 칸(바다로 분류된 곳)만 SRTM 으로 채운다.
2) 매끄럽게: 지형 데이터는 나무·건물 높이가 섞여 들쭉날쭉하므로, 서킷을 따라
   앞뒤 W/2 m 안의 값을 평균한다 (이동 평균, 닫힌 고리라 처음과 끝이 이어진다).
     두 서킷 모두 W = 150 m
   (먼저 BRIDGES 구간은 지형 데이터 대신 앞뒤 고도를 직선으로 이은 값으로 바꾼다 — 모나코 터널, 가정)
3) 저장: 중심선 점 번호별 고도 z (m, 해수면 기준). 물리 계산(src/physics)과 Blender 3D 모델이 이 파일 하나를 쓴다.

한계: 지형 "표면" 고도라 터널(모나코) 안 도로 높이는 실제보다 높게 나올 수 있다.
실행: python3 tools/process_elevation.py
"""

import math
from pathlib import Path

TR = Path(__file__).resolve().parent.parent / "data" / "tracks"
CFG = {"monza": ("monza_tum.csv", 150.0), "monaco": ("monaco.csv", 150.0)}

# 지형 데이터를 쓰지 않고 앞뒤 고도를 직선으로 잇는 구간 (가정)
#   모나코 점 118 ~ 250 (중심선 시작점 = 카지노 부근에서 약 590 ~ 1250 m):
#   포르티에 → 터널 → 누벨 시케인 해안 구간. 터널 입구·출구는 바닷가 도로(약 9 m, 6 m)인데
#   지형 데이터는 가운데가 18~28 m 로 솟는다 → 터널 위 건물·언덕의 "표면" 높이를 잡은 것으로 판단.
#   터널 안 실제 도로 높이는 출처가 없어 입구와 출구를 직선으로 이은 가정값을 쓴다.
BRIDGES = {"monaco": [(118, 250)]}


def main():
    for name, (track_csv, window) in CFG.items():
        xy = [tuple(map(float, l.split(",")[:2])) for l in (TR / track_csv).read_text().splitlines() if l.strip() and not l.startswith("#")]
        rows = [l.split(",") for l in (TR / f"{name}_elevation.csv").read_text().splitlines() if l and not l.startswith(("#", "index"))]
        assert len(rows) == len(xy), name
        z, src = [], []
        for r in rows:
            if r[3].strip():
                z.append(float(r[3]))
                src.append("eudem25m")
            else:
                z.append(float(r[4]))
                src.append("srtm30m")
        n = len(xy)
        for a, b in BRIDGES.get(name, []):
            for i in range(a + 1, b):
                z[i] = z[a] + (z[b] - z[a]) * (i - a) / (b - a)
                src[i] = "bridge_assumed"
        # 점 사이 거리 → 누적 거리
        seg = [math.dist(xy[i], xy[(i + 1) % n]) for i in range(n)]
        L = sum(seg)
        s = [0.0]
        for d in seg[:-1]:
            s.append(s[-1] + d)
        # 거리 기준 이동 평균 (닫힌 고리)
        zs = []
        for i in range(n):
            tot = cnt = 0.0
            for j in range(n):
                d = abs(s[j] - s[i])
                d = min(d, L - d)
                if d <= window / 2:
                    tot += z[j]
                    cnt += 1
            zs.append(tot / cnt)
        # 경사도 (앞뒤 점으로 계산한 기울기 %)
        grade = [100 * (zs[(i + 1) % n] - zs[i - 1]) / (seg[i - 1] + seg[i]) for i in range(n)]
        lines = [
            f"# {name} 고도 (m, 해수면 기준). 원본: {name}_elevation.csv (EU-DEM, 빈 칸은 SRTM, source=bridge_assumed 는 터널 등 직선 가정). 거리 {window:.0f} m 이동 평균. tools/process_elevation.py",
            "index,z_m,source",
        ]
        lines += [f"{i},{v:.3f},{src[i]}" for i, v in enumerate(zs)]
        (TR / f"{name}_z.csv").write_text("\n".join(lines) + "\n")
        print(
            f"{name}: 점 {n}, 둘레 {L:.0f} m, 원본 {min(z):.1f}~{max(z):.1f} m → 다듬은 고도 {min(zs):.1f}~{max(zs):.1f} m"
            f" (고저차 {max(zs) - min(zs):.1f} m), 최대 오르막 {max(grade):.1f} %, 최대 내리막 {min(grade):.1f} %, SRTM 으로 채운 점 {src.count('srtm30m')}, 직선 가정 점 {src.count('bridge_assumed')}"
        )


if __name__ == "__main__":
    main()
