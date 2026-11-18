# Mark Six Lab · 六合彩攪珠模擬器

香港六合彩嘅 3D 攪珠實驗室。49 粒號碼球喺透明球腔內混合，每輪依次抽出六個攪出號碼同一個特別號碼。支援逐粒開獎、快抽、單式自選／隨機選號、七個獎級對獎，同埋瀏覽器本機紀錄。純供娛樂。

[公開試玩](https://penny323mo.github.io/mark-six-lab/)

## 畫面同聲音

- 撳畫面或者「入現場」會進入全螢幕「自由行」，方向鍵、滾輪同觸控只控制現場。未支援原生全螢幕嘅瀏覽器會用鎖定嘅可視畫面。拖曳望四周，WASD 或方向鍵行走，Shift 快行，Q／E 調高度。手機左手用搖桿行走，右手拖曳轉視線。切換「環繞機身」可以用滾輪拉近游標位置，手機用雙指平移或縮放。「返機前」返回全機鏡頭，「號碼特寫」會先睇珠架，攪珠時睇全盤，每粒升球入軌先跟拍，之後返全盤。入場時控制台收起，撳「控制台」可睇返結果同配樂，Esc 或「離開現場」會返回原本網頁位置。直屏嘅鏡頭掣放喺畫面下方，手機橫屏展開控制台會移到側邊。
- 頁首、機座同背板嘅英文名稱經桌面、手機、正面同斜角核對。[MARK SIX 字樣近照](docs/mark-six-lettering.png)
- 「音效」控制攪珠機嘅聲音。落珠時，同一批波跌出珠槽會形成一串撞擊。攪拌期間，滾動聲跟實際移動同碰撞嘅球變化。升珠、入軌時，摩打同珠群聲收細，聽到單粒波停低嗰一下。混音參照 2026 年 11 月 17 日第 26/122 期重播，逐段對照開閘、攪拌、報號之間嘅相對音量。轉播收錄咗配樂同人聲，模擬器嘅機械聲由程式合成。[第 26/122 期攪珠重播，從珠架開始](https://ccbe.cc/uploads/videos/mark-six/2026122.mp4?v=1794923243#t=103) · [無綫新聞嘅第五代攪珠機現場片段](https://news.tvb.com/tc/1194867)
- 經典六合彩配樂嘅原曲係 Shocking Blue 於 1972 年發行嘅《Inkpot》。頁面用 Spotify 播原唱錄音。「背景音樂循環播放」預設開啟，入頁就嘗試播放，播到尾會由頭再播。攪珠、開獎同重置期間配樂會繼續。瀏覽器要求互動時，撳一下畫面即可再試。畫面提示時直接撳 Spotify 播放器嘅 ▶ 開聲。取消勾選會暫停，網站會記住設定。訪客可播嘅長度由 Spotify 決定。香港電視器樂編曲嘅獨立音源未獲核實。[配樂出處](https://collection.news/appledaily/articles/JJWDAB4VBNRIVZYRK7NVLPCVSA) · [Spotify 原曲](https://open.spotify.com/track/0KFnCHVyyzOQvWoJbjXi1n) · [香港 Apple Music](https://music.apple.com/hk/album/inkpot/298129966?i=298130088)

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

- 待機時 49 粒球分列機頂五條透明入球槽，由左至右每列最多十粒，細號在底。撳開始後托板退開，球沿原來嘅槽受重力跌入球腔。全數離開入球槽先開始攪拌。兩支機械攪拌臂反向旋轉，球體喺重力之下碰撞、滾入中央集球口。開閘時越過底部感應平面嘅一粒球會由升降桿送上機頂。
- 六粒攪出號碼沿左邊展示軌滾落，第七粒特別號碼入右軌。球停喺各自嘅軌道上，直至開始新一輪。開獎完成後，結果同最近紀錄會將頭六個號碼由細排到大，特別號碼排最後。
- 求解器以固定 120 Hz 步長計算同質量球體嘅撞擊、回彈同切向摩擦。斜撞產生轉動，移動緊嘅機臂同升降桿會將動量傳俾啲波。集球口等候入珠期間會調節模擬摩打速度，鬆開架住個入口嘅球。升降桿沿設定行程移動，顯示軌以實心球無滑動滾動嘅近似式計算角加速度。快抽沿用同一套求解器。
- 每輪以 Web Crypto 產生初始種子，改變球喺管內嘅微細位置、機臂起始角度、轉速同開閘時間。求解器根據球嘅位置同速度決定邊一粒入閘。摩擦、碰撞回彈、轉速同幾何尺寸係模擬設定，未經香港實機量度校準。

## 真機參考

- 第五代機型同前代交接。[Smartplay · 香港 Halogen III](https://www.smartplay.com/news/a-half-century-of-dreams-integrity-hong-kongs-mark-six-celebrates-50th-anniversary-with-smartplays-new-halogen-iii)
- Halogen 系列嘅重力混合、反向攪拌臂同透明球腔。[Smartplay · Halogen 產品規格](https://www.smartplay.com/lottery-products/lottery-draw-machines/halogen)
- 中央升球、機頂分流同左右軌道嘅外形參照第五代首播畫面。[香港01 · 第五代攪珠機](https://www.hk01.com/社會新聞/60346876/)
- 攪珠前點算、排列同檢查號碼球。[香港賽馬會 · 攪珠程序](https://www.hkjc.com/chinese/pressrelease/mcs01_showhtml.asp?SelType=NEWS&filename=20160219_143108_C_NEWS.htm)
- 廠內燈架、備用機同螢幕位置參照現場照片。[香港商報 · 走進六合彩攪珠現場](https://www.hkcd.com/hkcdweb/content/2026/06/02/content_8757900.html)

## 規則來源

- 攪出號碼、特別號碼同七個獎級嘅定義。[香港賽馬會 · 中獎資格](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/prize-qualification/)
- 單式從 1 至 49 號揀六個不同號碼。[香港賽馬會 · 投注種類](https://special.hkjc.com/e-win/zh-HK/betting-info/marksix/types-of-entry/)
- 正式獎券規則。[香港賽馬會 · 獎券規例](https://www.hkjc.com/chinese/betting/betting_rule.htm)
