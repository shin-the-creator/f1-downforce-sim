import { defineConfig } from 'vitest/config';

// GitHub Pages는 https://<사용자>.github.io/<저장소>/ 주소로 열리므로
// 빌드 결과의 기본 경로(base)를 저장소 이름으로 맞춘다.
export default defineConfig({
  base: '/f1-downforce-sim/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
