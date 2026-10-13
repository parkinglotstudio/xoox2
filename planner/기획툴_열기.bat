@echo off
chcp 65001 >nul
cd /d "%~dp0.."
rem 툴 서버(정화숲 툴·리소스 뷰어, 5190)를 따로 창에서 켠다
start "Soos Arcade 툴 서버" cmd /k "node node_modules\vite\bin\vite.js --port 5190 --strictPort"
start "" http://localhost:4174/
node planner\server.js
