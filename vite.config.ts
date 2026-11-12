import { defineConfig } from 'vitest/config';

// GitHub Pages 주소(https://<사용자>.github.io/<저장소>/)에 맞춘 기본 경로
export default defineConfig({
  base: '/f1-downforce-sim/',
  build: {
    // Chart.js + KaTeX 포함 (gzip 약 200 kB) — 이 앱에는 충분히 작다
    chunkSizeWarningLimit: 900,
  },
  test: { include: ['tests/**/*.test.ts'] },
});
