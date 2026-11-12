import { defineConfig } from 'vitest/config';

// GitHub Pages 주소(https://<사용자>.github.io/<저장소>/)에 맞춘 기본 경로
export default defineConfig({
  base: '/f1-downforce-sim/',
  test: { include: ['tests/**/*.test.ts'] },
});
