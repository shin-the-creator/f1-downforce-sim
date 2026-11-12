/** 앱 진입점 (지금은 분석 화면만) */
import './style.css';
import { mountAnalysis } from './ui/analysisView';

mountAnalysis(document.getElementById('app')!);
