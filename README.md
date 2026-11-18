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

- 由 49 粒球已經入咗球腔開始。兩支機械攪拌臂反向旋轉，球體喺重力之下碰撞、滾入中央集球口。開閘時越過底部感應平面嘅一粒球會由升降桿送上機頂。
- 六粒攪出號碼沿左邊展示軌滾落，第七粒特別號碼入右軌。球停喺各自嘅軌道上，直至開始新一輪。
- 求解器以固定 120 Hz 步長計算同質量球體嘅法向衝量、摩擦、轉動機臂同球腔接觸。顯示軌以實心球無滑動滾動嘅近似式計算角加速度。快抽只改變模擬時間速率。
- 號碼以 Web Crypto 隨機洗牌分配到球體，求解器只根據球嘅位置同速度決定邊一粒入閘。摩擦、碰撞回彈、轉速同幾何尺寸係模擬設定，未經香港實機量度校準。

## 真機參考

- 第五代機型同前代交接。[Smartplay · 香港 Halogen III](https://www.smartplay.com/news/a-half-century-of-dreams-integrity-hong-kongs-mark-six-celebrates-50th-anniversary-with-smartplays-new-halogen-iii)
- Halogen 系列嘅重力混合、反向攪拌臂同透明球腔。[Smartplay · Halogen 產品規格](https://www.smartplay.com/lottery-products/lottery-draw-machines/halogen)
- 中央升球、機頂分流同左右軌道嘅外形參照第五代首播畫面。[香港01 · 第五代攪珠機](https://www.hk01.com/社會新聞/60346876/)

## 規則來源

- 攪出號碼、特別號碼同七個獎級嘅定義。[香港賽馬會 · 中獎資格](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/prize-qualification/)
- 單式從 1 至 49 號揀六個不同號碼。[香港賽馬會 · 投注種類](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/types-of-entry/)
- 正式獎券規則。[香港賽馬會 · 獎券規例](https://www.hkjc.com/chinese/betting/betting_rule.htm)
