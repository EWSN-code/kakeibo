## 家計簿 v1.7.0b 更新手順

```bash
git add .
git commit -m "v1.7.0b 分析トレンド表示修正"
git push
```

### 修正点
- 実際に有効な期間対応版 renderOverview に月別推移を接続
- 費用・収入ドリルに drillTrend 描画先を追加
- 重複していた旧描画関数へだけ実装されていた問題を修正
