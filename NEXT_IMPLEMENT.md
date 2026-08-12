# 家計簿アプリ ― NEXT IMPLEMENT

## v0 〜 v0.7（済）
- 複式エンジン／口座8種／前払・現物券／全種編集／計算式／店学習
- カード締めサイクル＆消込／月移動／トレンド＆ドーナツ／CSV(ジャーナル・マージ)/JSON
- 固定費(周期・営業日調整)／カテゴリ分析(%・予算統合)／按分強化・検索&一括操作
- 予算(繰越)／積立(仮想封筒+シミュ+ガント)／ほしいもの(タグ)／価格比較(時系列+MA)
- 全角→半角／オートコンプリート(読み仮名)／レシートテンプレ／不正値の確認

## v1（今回）done ― マルチ端末化＋要望
- [x] **Supabaseクラウド同期**：`StorageAdapter` を差し替え（UI/ロジック無改修）。
      state(JSON)をユーザーごとに1行で保存。RLSで自分の行だけ読み書き。
- [x] **ログイン**：メール＋パスワード（共有アカウントで家族2人OK）。セッション永続化。
- [x] **PWA**：manifest＋Service Worker＋アイコン。ホーム画面に追加→アイコン起動、
      2回目以降はログイン省略。iOS/Android対応。
- [x] **オフライン拡張の土台**：save時に localStorage へも即キャッシュ。Supabase不可時は
      「ローカルモード」で起動（将来のフルオフライン同期に発展可能）。
- [x] **初回データ移行**：既存localStorage or JSONをクラウドへ自動アップ。
- [x] **カテゴリ検索入力**：カテゴリのselectを検索コンボボックス化（`select.catsel`＋`enhanceCatSelects`）。
      漢字/かな部分一致で絞り込み。入力・明細・固定費・予算・テンプレ・一括付替すべて対応。
- [x] **読み仮名の手動編集**：設定タブに「読み仮名の管理」。表示名→よみを追加/編集/削除。

## v1.1（次の候補・任意）
1. **オフライン完全対応**：Service Workerでデータ取得もキュー化、再接続時に同期。
   衝突は updatedAt / mergeTransactions を流用。
2. **リアルタイム反映**：Supabase Realtimeで、別端末の変更を開いたまま自動反映。
3. **閲覧専用モード**：共有アカウントでも「編集ボタンを隠す」トグル（お母さん向け）。
4. **ダッシュボード**：今月の要点（予算超過/カード期限/積立進捗）を1画面集約。
5. **秘匿帳簿**：別アカウント切替 or ローカル限定モードの導線を用意。

## セットアップ
- **SETUP.md** を参照（GitHub Pages / Netlify で公開 → スマホでホーム画面追加 → 共有アカウントでログイン）。

## 設計メモ（v1追加分）
- 接続: `config.js`（url / publishable key / table）
- 認証&同期: `cloud.js`
  - `window.StorageAdapter = { load: ()=>cachedState, save: (s)=>{localStorageキャッシュ＋デバウンスでupsert} }`
  - 認証後に app.js を動的注入（app.jsは同期のまま無改修）。DOM構築済みのため app.js末尾は
    `document.readyState` を見て boot。
  - テーブル: `public.kakeibo_state(user_id uuid PK, data jsonb, updated_at)` ＋ RLS 3ポリシー。
- カテゴリ検索: `enhanceCatSelects(root)` が `select.catsel` を検索入力化（selectを隠して真の値保持）。
- 読み仮名: `state.readings = {表示名: よみ}` / 設定の renderReadings/openReadingModal。
