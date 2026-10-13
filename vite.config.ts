import { defineConfig } from "vite";
import { resolve } from "path";
import { layoutSavePlugin } from "./scripts/vite-layout-save";

// 수스(C:\xoox)에서 가져온 정화숲 툴을 돌린다.
// 수스는 data/ 를 웹 루트로 썼다. 같은 내용을 assets/susu/ 에 복사해 두었으므로 그 폴더를 웹 루트로 쓴다.
export default defineConfig({
  server: { port: 5190, strictPort: true },
  publicDir: "assets/susu",
  plugins: [layoutSavePlugin()],
  build: {
    rollupOptions: {
      input: {
        tools: resolve(__dirname, "tools.html"),
        viewer: resolve(__dirname, "viewer.html"),
        combatSkillTool: resolve(__dirname, "combat-skill-tool.html"),
        unitLabTool: resolve(__dirname, "unit-lab-tool.html"),
        forestMapTool: resolve(__dirname, "forest-map-tool.html"),
        forestPlayTool: resolve(__dirname, "forest-play-tool.html"),
        forestPropTool: resolve(__dirname, "forest-prop-tool.html"),
        islandCoastTool: resolve(__dirname, "island-coast-tool.html"),
        // 아케이드 원본(본게임 이식용)
        arcade: resolve(__dirname, "arcade.html"),
        arcadeLobby: resolve(__dirname, "arcade-lobby.html"),
        arcadeCards: resolve(__dirname, "arcade-cards.html"),
        arcadeGame1: resolve(__dirname, "arcade-game1.html"),
        arcadeGame2: resolve(__dirname, "arcade-game2.html"),
        arcadeGame3: resolve(__dirname, "arcade-game3.html"),
        arcadeGame4: resolve(__dirname, "arcade-game4.html"),
      },
    },
  },
});
