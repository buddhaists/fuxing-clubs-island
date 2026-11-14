# 專案說明（給 Claude）

## 溝通語言
- 一律使用**繁體中文（台灣用語）**回覆使用者，包含說明、提問、測試結果與總結。
- 提交訊息（commit message）與 PR 標題、內容也使用繁體中文。
- 程式碼中的變數、函式名稱維持英文；程式註解使用繁體中文。

## 專案概要
- 「復興國小之福星社團翱翔島」：屏東縣復興國民小學 3D 社團探索互動網，純靜態網頁（Three.js），無建置步驟。
- 主要檔案：`index.html`、`js/app.js`（互動邏輯）、`js/world.js`（3D 場景）、`js/props.js`、`js/data.js`（社團資料）、`js/audio.js`（Web Audio 背景音樂與音效）、`css/style.css`。
- 部署：GitHub Pages（推送到 `main` 自動部署）與 Vercel（`vercel.json`）。
