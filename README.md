# Road to Cbum

個人用、手機優先嘅增肌追蹤頁。純 HTML / CSS / JavaScript，唔使 build。畫面繼續由 GitHub Pages 用 `main` 分支根目錄托管，網址不變。

飲食讀 Turso 資料庫 `cbum-daily-tracker`，經 Vercel 一個公開 `GET /api/diet` 返回同以前 `data/diet.json` 一樣嘅 JSON。瀏覽器唔可以寫飲食，亦唔會見到 Turso token。訓練仍然由手機 App 經 GitHub API 寫入 `data/training.json`。體重只供顯示。日期一律用香港時間（`Asia/Hong_Kong`）嘅 `YYYY-MM-DD`。

## 開 GitHub Pages

1. 打開呢個 repo → **Settings** → **Pages**
2. **Build and deployment** → Source 選 **Deploy from a branch**
3. Branch 選 **main**，資料夾選 **/ (root)**
4. Save

幾分鐘後網址會係：

`https://kuichingcheung.github.io/Cbum-daily-tracker/`

## 飲食資料（Turso）

寫入唔再 commit `data/diet.json`。歷史同之後每一日都放喺 Turso 資料庫 **`cbum-daily-tracker`**（`aws-ap-southeast-1`）。唔好郁其他資料庫。

`data/diet.json` 仍然留喺 repo，係遷移快照同 API 未就緒時嘅後備。API 返回至少一日有效紀錄之後，頁面就用 Turso 嗰份，唔再理 repo 入面舊檔。API 失敗或者尚未 publish，頁面先會退回 `data/diet.json`，所以未切換之前現有 GitHub Pages 仍然睇到舊紀錄。

### 托管

| 嘢 | 邊度 |
| --- | --- |
| 畫面（今日、紀錄、統計、設定） | 繼續係 `https://kuichingcheung.github.io/Cbum-daily-tracker/` |
| 飲食讀取 | `GET https://cbum-daily-tracker.vercel.app/api/diet` |
| 訓練寫入 | 手機 localStorage 嘅 GitHub token，寫 `data/training.json` |

GitHub Pages 唔使改網址，亦唔使 redirect。iPhone 主畫面個捷徑可以照用。Vercel 項目已經喺團隊 `kuikui-pt`，名稱 `cbum-daily-tracker`，函數區域 `sin1`（貼近資料庫）。如果實際網址唔係上面嗰個，改 `js/config.js` 入面 `DIET_API_ORIGIN`。

Vercel 同時可以托管同一套靜態檔。喺 `*.vercel.app` 上面，頁面會讀同網域嘅 `/api/diet`。Production 唔好開 Vercel Authentication，否則 GitHub Pages 讀唔到 API，會靜靜雞退回 repo 入面嘅舊 `data/diet.json`。

### 環境變數

只設喺 Vercel 項目（Production 同 Preview）。唔好 commit，唔好放進前端。

| 變數 | 值 |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://cbum-daily-tracker-kuichingcheung.aws-ap-southeast-1.turso.io` |
| `TURSO_AUTH_TOKEN` | **read-only** token，只限呢個資料庫 |

Turso MCP 開唔到 token。要喺 Turso dashboard，或者用 CLI：

```bash
turso db tokens create cbum-daily-tracker --read-only
```

用 read-only token。就算 Vercel 環境變數外洩，都改唔到飲食。API 本身只跑 `SELECT`。

### Schema

`schema.sql` 有三句，每句分開跑（`evolve_schema` 一次一句）。表：

- `diet_meta`：一行，`id = 1`。`ready = 1` 先至公開俾個 API。
- `diet_rules`：一行，`payload` 係 `rules` 物件嘅 JSON。
- `diet_days`：一日一行。`date` 係 `YYYY-MM-DD`，`document` 係嗰日完整物件（`complete`、`target`、`intake`、`meals`、`note`），同 `data/diet.json` 入面 `days[]` 元素一樣。`meals[].items` 可以係字串或者字串陣列，唔好拆散。

未 publish 之前，API 回 `503`，頁面繼續用 repo 嘅 JSON，所以可以先入歷史再公開。

### 遷歷史

喺有 `data/diet.json` 嘅 commit 上面：

```bash
node scripts/export-diet-sql.mjs
```

輸出係一句一句嘅 `INSERT ... ON CONFLICT`，最後先係 publish。順序：

1. 跑完 `schema.sql` 三句
2. 跑 rules 同每一日嘅 upsert（可以重複跑）
3. `SELECT COUNT(*) FROM diet_days` 要等如個快照嘅日數（呢份 repo 係 **41** 日，`2026-10-03` 至 `2026-11-27`）
4. 先至跑最後嗰句 publish

Publish：

```sql
INSERT INTO diet_meta (id, ready) VALUES (1, 1)
ON CONFLICT(id) DO UPDATE SET ready = excluded.ready;
```

要收返公開讀取：

```sql
UPDATE diet_meta SET ready = 0 WHERE id = 1;
```

### 之後改某一日

取代嗰一日嘅成個 JSON，唔好刪其他日。`complete` 用 JSON `true` / `false`。例子（食得未完）：

```sql
INSERT INTO diet_days (date, document) VALUES (
  '2026-11-28',
  '{"date":"2026-11-28","complete":false,"target":{"kcal":1993,"protein":119,"carbs":231,"fat":66},"intake":{"kcal":500,"protein":40,"carbs":50,"fat":10},"meals":[{"time":"08:00","name":"早餐","items":"燕麥","kcal":500,"protein":40,"carbs":50,"fat":10}],"note":""}'
)
ON CONFLICT(date) DO UPDATE SET document = excluded.document;
```

字串入面有單引號就要寫兩次（`'` → `''`）。`node scripts/export-diet-sql.mjs` 會幫現有 `data/diet.json` 做呢件事；新一日可以直接寫上面嗰種 SQL。

Rules 幾乎唔使改。要改先：

```sql
INSERT INTO diet_rules (id, payload) VALUES (
  1,
  '{"kcal":"intake between 95% and 105% of target","protein":"intake >= 95% of target","carbs":"intake >= 95% of target","fat":"intake <= 105% of target"}'
)
ON CONFLICT(id) DO UPDATE SET payload = excluded.payload;
```

### 呢份 commit 已經寫入 Turso 嘅嘢

`cbum-daily-tracker` 已經有 schema、rules，同埋呢份 `data/diet.json` 嘅 **41** 日（`2026-10-03` 至 `2026-11-27`）。`diet_meta.ready = 1`，所以 API 一通就可以讀。之後新一日唔好再 commit `data/diet.json`，用上面嘅 upsert。重跑 `node scripts/export-diet-sql.mjs` 係安全嘅，同一日會被取代，唔會重複。

### 切換前仲要做

Vercel 團隊 `kuikui-pt` 已經有項目 `cbum-daily-tracker`（`prj_M0DM1qgh8KHLWcs41NCvJwKjROyJ`）。Vercel Authentication 已關掉，等 GitHub Pages 可以匿名 `GET /api/diet`。函數區域係 `sin1`。

1. 項目已經連住 `kuichingcheung/Cbum-daily-tracker`，production branch 係 `main`。合併之後會自動部署。
2. 設 `TURSO_DATABASE_URL` 同 read-only 嘅 `TURSO_AUTH_TOKEN`（Production 同 Preview）。Turso MCP 開唔到呢粒 token。
3. 部署包含呢個 PR 嘅 `main` 之後，開 `GET https://cbum-daily-tracker.vercel.app/api/diet`，確認 `days` 長度係 41。
4. GitHub Pages 會自己優先讀呢個 API，唔使改 Pages 網址。

未設好 token 或者 API 未部署，頁面會繼續用 `data/diet.json`，而家個站唔會空白。

## 整 fine-grained token（只係訓練）

App 要更新 `data/training.json`，需要一粒 Personal access token（fine-grained）。飲食唔再用呢粒 token。

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Repository access 選 **Only select repositories**，只勾 **Cbum-daily-tracker**
3. Permissions → Repository permissions → **Contents** 設做 **Read and write**
4. Generate，複製 token
5. 用 Safari 打開上面個 Pages 網址 → **設定** → 貼上 token → **儲存設定**，可以再撳 **測試連線**

Token 只會存喺部手機嘅 `localStorage`，唔會 commit 入 repo。清除瀏覽器網站資料或者撳「清除 token」就會冇咗。

飲食一律先讀 Turso API。訓練同體重有 token 時會優先用 GitHub API（失敗先試 raw），所以儲存訓練之後唔使等 Pages 重新部署。冇 token 就讀相對路徑 `data/training.json` 同 `data/weighins.json`。

## 加到 iPhone 主畫面

1. 用 **Safari** 打開 Pages 網址（唔好用 in-app browser）
2. 撳底部分享按鈕
3. 向下搵 **加入主畫面** → **加入**
4. 之後由主畫面個 **Road to Cbum** 圖示開，會以獨立畫面顯示，唔會帶 Safari 工具列

## 畫面

- **今日**：當日飲食攝取對比目標（熱量、蛋白質、碳水、脂肪）、餐單、教練備註，同埋訓練開關
- **紀錄**：月曆，一星期由星期日開始。飲食點：綠＝達標、紅＝未達標、灰＝進行中、淡灰＝未有紀錄；另外有青點代表有操。撳一日可以睇詳情同補返訓練
- **統計**：近 7 日同近 30 日嘅達標日數、平均攝取 / 目標、訓練日數同部位次數，加埋體重走勢
- **設定**：token、repo，同測試連線

`complete: false` 嘅日子顯示 **進行中**，唔會判達標定未達標。至少三項達標先算全日達標。

## 達標規則

同 `data/diet.json` 入面 `rules` 一致：

| 項目 | 達標 |
| --- | --- |
| 熱量 | 攝取係當日目標嘅 95%–105% |
| 蛋白質 | 攝取 ≥ 目標嘅 95%，冇上限 |
| 碳水 | 攝取 ≥ 目標嘅 95%，冇上限 |
| 脂肪 | 攝取 ≤ 目標嘅 105%，冇下限 |

每項會顯示 **差 X**（未到目標）或者 **超 X**（超過目標）。差／超係同目標數字比，唔係同門檻比；過唔過關睇上面條規則。

## 數據格式（教練）

飲食改 Turso 嘅 `diet_days.document`，形狀同下面 `data/diet.json` 一樣。`data/diet.json` 而家係快照同後備，唔好再每日 commit。體重仍然只改 `data/weighins.json`。`data/training.json` 由 App 寫。改訓練之前請先 `git pull`，避免同手機儲存撞 sha。

### `data/diet.json`

```json
{
  "rules": {
    "kcal": "intake between 95% and 105% of target",
    "protein": "intake >= 95% of target",
    "carbs": "intake >= 95% of target",
    "fat": "intake <= 105% of target"
  },
  "days": [
    {
      "date": "2026-10-03",
      "complete": true,
      "target": { "kcal": 2600, "protein": 140, "carbs": 340, "fat": 72 },
      "intake": { "kcal": 2537, "protein": 154.5, "carbs": 265, "fat": 98 },
      "meals": [
        {
          "time": "08:22",
          "name": "早餐",
          "items": "燕麥 50g、牛奶 200ml",
          "kcal": 701,
          "protein": 23,
          "carbs": 80,
          "fat": 34
        }
      ],
      "note": "熱量接近目標。"
    }
  ]
}
```

- `date`：`YYYY-MM-DD`（香港時間）
- `complete`：`false` 代表當日仲未食完，App 顯示進行中
- `target` / `intake`：`kcal`，以及 `protein`、`carbs`、`fat`（克）
- `meals`：`time`、`name`、`items`、四項營養數字
- `note`：當日備註，可留空字串
- 新一日 append 入 `days`，唔好改欄位名

### `data/training.json`

```json
{
  "days": [
    { "date": "2026-10-03", "trained": true, "parts": ["胸", "三頭"], "note": "推日" }
  ]
}
```

- `trained`：有冇操
- `parts`：`胸`、`背`、`肩`、`二頭`、`三頭`、`腿`、`臀`、`腹`、`帶氧`、`休息`
- `note` 可省略
- App 會按日期取代或新增當日，並保持日期排序

### `data/weighins.json`

```json
{
  "entries": [
    { "date": "2026-10-04", "weight": 64.9, "bodyFat": 17.6, "note": "空肚" }
  ]
}
```

- `weight` 必填（kg）
- `smm`（骨骼肌）、`bodyFat`（體脂 %）、`note` 可省略
- App 只讀，唔會改呢個檔

## 本機預覽

唔好用 `file://` 直接開，瀏覽器會擋 `fetch`。

```bash
python3 -m http.server 8080
```

然後開 `http://127.0.0.1:8080/`。本機冇 `/api/diet` 時會讀 `data/diet.json`。

邏輯同訓練儲存（mock fetch，唔使真 token）可以用：

```bash
node --test
```
