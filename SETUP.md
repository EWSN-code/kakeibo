## 家計簿 v1.6.2f 更新手順

```bash
git add .
git commit -m "v1.6.2f レシート反映ボタン修正"
git push
```

### 変更点
- レシートUIの sync() がカテゴリ検索UI内の data-i を拾わないよう修正
- receipt-card 本体のみ同期対象に変更
- null guard を追加して、ri_on 等が存在しない要素で落ちないよう修正
- CベースのレシートUIとカテゴリ一覧関連機能は維持
- src/app/*.part.js も v1.6.2f に更新
