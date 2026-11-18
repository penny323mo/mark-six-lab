# Mark Six Lab · 六合彩攪珠模擬器

香港六合彩嘅 3D 攪珠實驗室。49 粒號碼球喺透明球腔內混合，每輪依次抽出六個攪出號碼同一個特別號碼。支援逐粒開獎、快抽、單式自選／隨機選號、七個獎級對獎，同埋瀏覽器本機紀錄。純供娛樂。

[公開試玩](https://penny323mo.github.io/mark-six-lab/)

## 本機運行

需要 Node.js 20 或更新版本。

```sh
npm ci
npm run dev
npm test
npm run build
```

`npm run build` 會輸出可放喺靜態網站嘅 `dist/`。3D 場景由 Three.js 幾何同程序化材質構成，瀏覽器需要 WebGL 2。WebGL 2 不可用時會用 Canvas 2D 繼續顯示同一套物理模型。

## 攪珠模型

- 求解器每秒更新 120 次。球體同質量同半徑，受重力、阻力、程序化氣流同出珠口吸力影響。球對球、球對球腔同球對出珠口會計算碰撞同反彈。
- 逐粒取出真正越過出珠口嘅球。通過出口後，畫面會沿透明導槽顯示球嘅移動。快抽只加快計算時間。
- 用瀏覽器 Web Crypto 將 49 個號碼無偏洗牌，再派到初始球體。求解器只睇位置、速度、半徑同碰撞，號碼只用嚟顯示同記錄。
- 氣流係近似力場。測試涵蓋接觸動量、出珠口限制、無重覆出珠、號碼中立性同七個獎級。

## 規則來源

- 攪出號碼、特別號碼同七個獎級嘅定義。[香港賽馬會 · 中獎資格](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/prize-qualification/)
- 單式從 1 至 49 號揀六個不同號碼。[香港賽馬會 · 投注種類](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/types-of-entry/)
- 正式獎券規則。[香港賽馬會 · 獎券規例](https://www.hkjc.com/chinese/betting/betting_rule.htm)
