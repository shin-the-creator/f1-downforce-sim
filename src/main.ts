// 2단계에서 화면을 만든다. 지금은 패널법이 브라우저에서 동작하는지만 확인한다.
import { analyzeInviscid } from './physics/wing';

const r = analyzeInviscid('4412', true, 0);
document.querySelector('#app')!.textContent =
  `NACA 4412 역방향, 받음각 0° → 비점성 다운포스 계수 C_DF = ${r.cDownforce.toFixed(3)}`;
