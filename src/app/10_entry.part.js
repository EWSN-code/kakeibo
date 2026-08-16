  /* ============ 入力フォーム（サマリなし） ============ */
  function dateField() { return `<div class="field"><label>日付</label><div class="date-wrap"><input type="date" id="f_date" value="${ui._date || M.todayStr()}"><button type="button" class="today-btn" id="f_today">今日</button></div></div>`; }
  function storeRow() { return `<div class="row"><div class="field" style="flex:2"><label>店名</label><input id="f_store" list="dl-store" value="${esc(ui._store)}" placeholder="例: スーパーマルエツ"></div><div class="field"><label>支店名</label><input id="f_branch" list="dl-branch" value="${esc(ui._branch)}" placeholder="例: 駅前店"></div>${dateField()}</div>`; }
  function memoRow() { return `<div class="field"><label>メモ（任意）</label><textarea id="f_memo" rows="1">${esc(ui._memo)}</textarea></div>`; }
  function bindCommon() { const td = $('#f_today'); if (td) td.addEventListener('click', () => { $('#f_date').value = M.todayStr(); ui._date = M.todayStr(); }); const dt = $('#f_date'); if (dt) dt.addEventListener('change', () => ui._date = dt.value); }

  function renderEntry() {
    renderEditBanner();
    $$('#typebar button').forEach(b => b.classList.toggle('active', b.dataset.type === ui.type));
    const host = $('#entryForm'); const type = ui.type;
    if (type === 'expense') {
      host.innerHTML = `<div id="tplBar" class="tpl-bar"></div>` + storeRow() + `<div id="storeChips" class="chips"></div><div class="lines-head"><label style="margin:0">明細（何に使ったか・複数可／金額は計算式OK 例:150+200）</label></div><div id="debitArea"></div><div class="row" style="gap:6px;margin-top:6px"><button class="btn ghost sm" id="addDebit">＋明細を追加</button><button class="btn ghost sm" id="receiptInput">レシート金額入力</button></div><div class="field" style="margin-top:10px"><label>購入合計（任意・先に総額を決めて割り振る）</label><input id="f_total" inputmode="decimal" value="${esc(ui.exp.total)}" placeholder="空欄なら明細の合計を使用"></div><div class="alloc-tools" id="allocTools"></div><div class="totline"><span>明細合計 <span id="allocInfo" class="muted"></span></span><span class="v" id="debitTotal">¥0</span></div><div class="toggle-detail"><input type="checkbox" id="f_detail" ${ui.exp.detail ? 'checked' : ''}><label for="f_detail" style="margin:0">支払を複数手段に分ける（現金＋ポイント等）</label></div><div id="creditArea"></div>${memoRow()}<div class="balance-warn" id="warn"></div><button class="btn" id="submit">${ui.editId ? '更新する' : '記帳する'}</button>`;
      renderDebits(); renderCreditsExp(); renderStoreChips(); renderAllocTools(); renderTplBar();
      $('#f_store').addEventListener('input', onStoreInput);
      $('#addDebit').addEventListener('click', () => { syncExpFromDOM(); ui.exp.debits.push({ path: '', amt: '', ratio: '' }); renderDebits(); recalcExpense(); }); const ri=$('#receiptInput'); if(ri)ri.addEventListener('click', openReceiptInputModal);
      $('#f_total').addEventListener('input', () => { ui.exp.total = $('#f_total').value; recalcExpense(); });
      $('#f_detail').addEventListener('change', e => { syncExpFromDOM(); ui.exp.detail = e.target.checked; if (!ui.exp.detail) ui.exp.credits = [{ accId: ui.exp.credits[0] ? ui.exp.credits[0].accId : '', amt: '' }]; renderCreditsExp(); recalcExpense(); });
      recalcExpense();
    } else if (type === 'income') {
      host.innerHTML = `<div class="row"><div class="field" style="flex:2"><label>収入カテゴリ</label><select id="f_cat" class="catsel">${categoryOptions('income', ui._catPath)}</select></div><div class="field"><label>金額</label><input id="f_amount" inputmode="decimal" value="${ui._amt || ''}" placeholder="0"></div></div><div class="amt-eval" id="amtEval"></div><div class="field"><label>入金先口座</label><select id="f_acc">${accountOptions(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'asset' && a.subtype !== 'voucher_goods', ui._accId)}</select></div>${storeRow()}${memoRow()}<button class="btn" id="submit">${ui.editId ? '更新する' : '記帳する'}</button>`;
      bindFormulaEval('#f_amount', '#amtEval');
    } else if (type === 'transfer') {
      host.innerHTML = `<div class="row"><div class="field"><label>移動元（貸方）</label><select id="f_from">${accountOptions(a => a.subtype !== 'voucher_goods', ui._fromId)}</select></div><div class="field"><label>移動先（借方）</label><select id="f_to">${accountOptions(a => a.subtype !== 'voucher_goods', ui._toId)}</select></div><div class="field"><label>金額</label><input id="f_amount" inputmode="decimal" value="${ui._amt || ''}" placeholder="0"></div></div><div class="amt-eval" id="amtEval"></div><p class="hint">例: 現金→WAONチャージ、銀行→現金、銀行→貯蓄用口座。</p>${storeRow()}${memoRow()}<button class="btn" id="submit">${ui.editId ? '更新する' : '記帳する'}</button>`;
      bindFormulaEval('#f_amount', '#amtEval');
    } else if (type === 'prepaid') {
      const pp = ui._prepaid || {};
      host.innerHTML = `<p class="hint"><b>金額型</b>=商品券/ポイント等は額面管理＋差額をプレミアム益に。<b>現物型</b>=コーヒーチケット等は原価主義＋数量管理。</p><div class="field"><label>購入する前払口座</label><select id="f_to">${accountOptions(a => ['voucher_amount', 'voucher_goods', 'emoney', 'point'].includes(a.subtype), pp.toId)}</select></div><div id="prepaidFields"></div><div class="field"><label>支払元（貸方）</label><select id="f_from">${accountOptions(a => ['cash', 'bank', 'emoney'].includes(a.subtype), pp.fromId)}</select></div>${storeRow()}${memoRow()}<button class="btn" id="submit">${ui.editId ? '更新する' : '記帳する'}</button>`;
      renderPrepaidFields(); $('#f_to').addEventListener('change', renderPrepaidFields);
    } else if (type === 'goods_use') {
      const goodsAccs = accountsBy(a => a.subtype === 'voucher_goods');
      if (!goodsAccs.length) { host.innerHTML = `<p class="hint">現物券口座がありません。「残高・口座」→口座追加で <b>現物券(原価主義)</b> を作成してください。</p>`; return; }
      const g = ui._goods || {};
      host.innerHTML = `<p class="hint">現物券を使う＝取得原価/枚で費用化し残数を減らします。値上がり益は記帳しません。</p><div class="row"><div class="field"><label>使う現物券</label><select id="f_goods">${goodsAccs.map(a => `<option value="${a.id}" ${a.id === g.goodsId ? 'selected' : ''}>${esc(a.name)}（残${M.goodsQty(state, a.id)}枚）</option>`).join('')}</select></div><div class="field"><label>枚数</label><input type="number" id="f_qty" value="${g.qty || 1}" min="1"></div></div><div class="field"><label>費用カテゴリ</label><select id="f_cat" class="catsel">${categoryOptions('expense', g.catPath || 'exp>食費>外食>カフェ・軽食')}</select></div>${storeRow()}${memoRow()}<div class="hint" id="goodsCostHint"></div><button class="btn" id="submit">${ui.editId ? '更新する' : '記帳する'}</button>`;
      const upd = () => { const a = accById($('#f_goods').value); let unit; if (ui.editId && ui._goods) unit = ui._goods.unitCost; else { const bal = M.accountBalance(state, a.id), q = M.goodsQty(state, a.id); unit = q > 0 ? bal / q : 0; } const useQ = +($('#f_qty').value || 1); const q = M.goodsQty(state, a.id); $('#goodsCostHint').textContent = `原価/枚 ${yen(unit)} × ${useQ}枚 = ${yen(unit * useQ)} を費用化${ui.editId ? '（編集: 登録時の単価を使用）' : `（残 ${q}→${q - useQ}枚）`}`; };
      $('#f_goods').addEventListener('change', upd); $('#f_qty').addEventListener('input', upd); upd();
    }
    bindCommon(); decorateInputs($('#entryForm')); const sb = $('#submit'); if (sb) sb.addEventListener('click', onSubmit);
  }
  function bindFormulaEval(inputSel, evalSel) { const inp = $(inputSel), out = $(evalSel); if (!inp || !out) return; const upd = () => { const raw = M.toHankaku(inp.value).trim(); if (!raw || /^\d+$/.test(raw)) { out.textContent = ''; return; } const v = M.evalAmount(inp.value); out.textContent = Number.isNaN(v) ? '⚠ 式が不正です' : '= ' + yen(v); }; inp.addEventListener('input', upd); upd(); }
  function renderDebits() { const area = $('#debitArea'); if (!area) return; const rm = ui.exp.ratioMode; area.innerHTML = ui.exp.debits.map((d, i) => `<div class="line-row" data-i="${i}"><div class="field cat"><select class="d_cat catsel">${categoryOptions('expense', d.path)}</select></div>${rm ? `<div class="field ratio"><input class="d_ratio" inputmode="decimal" value="${esc(d.ratio || '')}" placeholder="比" title="割合(重み)"></div>` : ''}<div class="field amt"><input class="d_amt" inputmode="decimal" value="${esc(d.amt)}" placeholder="0 (式可)"><div class="amt-eval d_eval"></div></div><div><button class="btn ghost sm d_del">✕</button></div></div>`).join(''); $$('.line-row', area).forEach(row => { const i = +row.dataset.i; const cat = row.querySelector('.d_cat'), amt = row.querySelector('.d_amt'), ev = row.querySelector('.d_eval'); if (ui.exp.debits[i].path) cat.value = ui.exp.debits[i].path; cat.addEventListener('change', () => ui.exp.debits[i].path = cat.value); amt.addEventListener('input', () => { ui.exp.debits[i].amt = amt.value; const raw = M.toHankaku(amt.value).trim(); ev.textContent = (!raw || /^\d+$/.test(raw)) ? '' : (Number.isNaN(M.evalAmount(amt.value)) ? '⚠ 式が不正' : '= ' + yen(M.evalAmount(amt.value))); recalcExpense(); }); const rat = row.querySelector('.d_ratio'); if (rat) rat.addEventListener('input', () => ui.exp.debits[i].ratio = rat.value); row.querySelector('.d_del').addEventListener('click', () => { syncExpFromDOM(); ui.exp.debits.splice(i, 1); if (!ui.exp.debits.length) ui.exp.debits.push({ path: '', amt: '', ratio: '' }); renderDebits(); recalcExpense(); }); }); attachHankakuAll(area); enhanceCatSelects(area); }


  /* ---- レシートOCR解析 v2 ---- */
  const RECEIPT_PROFILES = {
    generic: { label: '汎用', discountWords: ['割引','値引','値引き','まとめ値引','アプリ月間割引'], ignoreWords: ['ボーナスポイント','ポイント','合計','小計','お預り','お釣り','釣銭','WAON','クレジット'] },
    aeon: { label: 'イオン', discountWords: ['割引','まとめ値引','アプリ月間割引'], ignoreWords: ['ボーナスポイント','WAON','イオン','AEON','合計','小計','お預り','お釣り'] }
  };
  function receiptCategoryHint(name) {
    const flat = M.flattenCategories(state.categories, 'expense');
    const pick = words => flat.find(c => words.some(w => c.label.includes(w)))?.path || '';
    if (/牛乳|チーズ|ヨーグルト|モッツレラ|カマンベール/.test(name)) return pick(['乳製品','食材','食費']);
    if (/なす|ナス|ピーマン|野菜/.test(name)) return pick(['野菜','食材','食費']);
    if (/焼魚|ちくわ|魚|練物/.test(name)) return pick(['魚','魚介','練物','食材','食費']);
    if (/バゲット|パン|焼きいも|焼いも|おやつ/.test(name)) return pick(['パン','菓子','食材','食費']);
    if (/歯ブラシ|デンタル|ゴキ|殺虫|洗剤|日用品/.test(name)) return pick(['日用品','衛生','雑費']);
    return pick(['食材','食費']) || (flat[0]?.path || '');
  }
  function receiptTaxHint(name, markedReduced) {
    if (markedReduced) return 8;
    if (/牛乳|チーズ|ヨーグルト|モッツレラ|カマン|なす|ナス|ピーマン|焼魚|ちくわ|バゲット|パン|焼きいも|食品|食材/.test(name)) return 8;
    if (/歯ブラシ|デンタル|ゴキ|殺虫|洗剤|日用品/.test(name)) return 10;
    return '';
  }
  function receiptNumToken(tok) {
    const raw = String(tok || '');
    const markedReduced = /[※＊*]/.test(raw);
    const s = M.toHankaku(raw).replace(/[※＊*]/g,'').replace(/[¥￥,，円]/g,'').trim();
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
    return { value: yenRound(+s), markedReduced };
  }
  function normalizeReceiptText(text) {
    return M.toHankaku(String(text||''))
      .replace(/[\r\n]+/g,' ')
      .replace(/[（）()]/g,' ')
      .replace(/([+-]?\d[\d,]*[※＊*]?)/g,' $1 ')
      .replace(/(割引|値引き|値引|まとめ値引|アプリ月間割引|ボーナスポイント)/g,' $1 ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function parseReceiptTextV2(text, profileKey) {
    const prof = RECEIPT_PROFILES[profileKey] || RECEIPT_PROFILES.generic;
    const tokens = normalizeReceiptText(text).split(' ').filter(Boolean);
    const items = [];
    let name = [];
    let pendingDiscount = 0;
    let ignoreUntilNextPrice = false;
    const isDiscountWord = t => prof.discountWords.some(w => t.includes(w));
    const isIgnoreWord = t => prof.ignoreWords.some(w => t.includes(w));
    const flushNameAsNote = () => { name = []; };
    for (let i=0;i<tokens.length;i++) {
      const tok = tokens[i];
      if (/^\d+%$/.test(tok)) continue;
      if (/^P$|^\d+P$/i.test(tok)) { flushNameAsNote(); continue; }
      if (/個|単|点|合計|小計/.test(tok) && !receiptNumToken(tok)) continue;
      if (isIgnoreWord(tok)) { ignoreUntilNextPrice = /ボーナスポイント|ポイント/.test(tok); flushNameAsNote(); continue; }
      if (isDiscountWord(tok)) { continue; }
      const num = receiptNumToken(tok);
      if (num) {
        if (ignoreUntilNextPrice && num.value >= 0) { ignoreUntilNextPrice = false; continue; }
        if (num.value < 0) {
          if (name.length) pendingDiscount += num.value;
          else if (items.length) items[items.length-1].discount += num.value;
          continue;
        }
        if (name.length) {
          const nm = name.join(' ').replace(/^[\-:：]+|[\-:：]+$/g,'').trim();
          if (nm) {
            const tax = receiptTaxHint(nm, num.markedReduced);
            const discount = pendingDiscount;
            const gross = num.value;
            const item = { name:nm, gross, discount, taxRate:tax, category:receiptCategoryHint(nm), enabled:true };
            item.net = yenRound(gross + discount);
            items.push(item);
          }
          name = [];
          pendingDiscount = 0;
        }
        continue;
      }
      if (/^[-+x×]$/.test(tok)) continue;
      name.push(tok.replace(/[※＊*]/g,''));
      if (name.length > 8) name.shift();
    }
    return items.filter(x => x.name && x.net !== 0);
  }
  function receiptEffectiveNet(item, taxMode, roundMode) {
    const base = yenRound((+item.gross || 0) + (+item.discount || 0));
    if (taxMode !== 'excluded') return base;
    const rate = +item.taxRate || 10;
    const raw = base * (1 + rate / 100);
    if (roundMode === 'floor') return Math.floor(raw);
    if (roundMode === 'ceil') return Math.ceil(raw);
    return Math.round(raw);
  }
  function safeJsonParseLoose(text) {
    const s = String(text||'').trim().replace(/^```(?:json)?/,'').replace(/```$/,'').trim();
    return JSON.parse(s);
  }
  function receiptItemsFromAI(text) {
    const obj = safeJsonParseLoose(text);
    const arr = obj.items || obj.lines || [];
    return arr.map(x => ({
      name: String(x.name || x.item || '').trim(),
      gross: yenRound(x.gross ?? x.price ?? x.amount ?? x.net ?? 0),
      discount: yenRound(x.discount || 0),
      net: yenRound(x.net ?? ((x.gross ?? x.price ?? x.amount ?? 0) + (x.discount || 0))),
      taxRate: x.taxRate == null ? '' : +x.taxRate,
      category: x.categoryHint || x.category || receiptCategoryHint(String(x.name || x.item || '')),
      enabled: true
    })).filter(x => x.name && x.net);
  }
  function buildReceiptAIPrompt(text) {
    return `このレシート写真またはOCRテキストから、家計簿アプリに取り込むためのJSONだけを返してください。説明文やMarkdownは禁止です。\n\n抽出する項目:\n- 商品名 name\n- 元価格 gross\n- 割引額 discount（値引きは負数）\n- 実質金額 net\n- 税率候補 taxRate（8 / 10 / null）\n- カテゴリ候補 categoryHint（不明ならnull）\n\n注意:\n- ※や*が付いた商品は軽減税率8%候補です。\n- ボーナスポイントやポイント付与は明細から除外してください。\n- 割引は可能な限り該当商品に紐づけてください。\n- 合計が不明または合わない場合はwarningsに理由を書いてください。\n\n出力形式:\n{"items":[{"name":"","gross":0,"discount":0,"net":0,"taxRate":8,"categoryHint":null}],"warnings":[]}\n\nOCRテキスト:\n---\n${text}\n---`;
  }
  function openReceiptInputModal() {
    syncExpFromDOM();
    let pasteText = '';
    let aiText = '';
    let profile = 'aeon';
    let taxMode = 'included';
    let roundMode = 'round';
    let items = [];
    const total = () => items.filter(x=>x.enabled).reduce((s,x)=>s+receiptEffectiveNet(x,taxMode,roundMode),0);
    const sync = () => {
      const pt=$('#ri_paste'); if(pt) pasteText=pt.value;
      const ai=$('#ri_ai'); if(ai) aiText=ai.value;
      const pr=$('#ri_profile'); if(pr) profile=pr.value;
      const tm=$('#ri_taxMode'); if(tm) taxMode=tm.value;
      const rm=$('#ri_round'); if(rm) roundMode=rm.value;
      $$('#ri_items tr[data-i]').forEach(tr=>{const i=+tr.dataset.i; const it=items[i]; if(!it)return; it.enabled=tr.querySelector('.ri_on').checked; it.name=tr.querySelector('.ri_name').value; it.gross=evalYen(tr.querySelector('.ri_gross').value); it.discount=evalYen(tr.querySelector('.ri_disc').value); it.taxRate=tr.querySelector('.ri_tax').value; it.category=tr.querySelector('.ri_cat').value; it.net=yenRound((Number.isNaN(it.gross)?0:it.gross)+(Number.isNaN(it.discount)?0:it.discount));});
    };
    const draw = () => {
      $('#modal').innerHTML = `<h3>レシートOCR解析 v2</h3><p class="hint">商品名・元価格・割引・税率候補を解析します。※/*付き価格は軽減税率8%候補として扱います。解析後に手修正してから明細へ反映できます。</p><div class="row" style="gap:8px"><div class="field"><label>店別ルール</label><select id="ri_profile"><option value="aeon" ${profile==='aeon'?'selected':''}>イオン</option><option value="generic" ${profile==='generic'?'selected':''}>汎用</option></select></div><div class="field"><label>税モード</label><select id="ri_taxMode"><option value="included" ${taxMode==='included'?'selected':''}>税込として読む</option><option value="excluded" ${taxMode==='excluded'?'selected':''}>外税を加算</option></select></div><div class="field"><label>外税端数</label><select id="ri_round"><option value="round" ${roundMode==='round'?'selected':''}>四捨五入</option><option value="floor" ${roundMode==='floor'?'selected':''}>切り捨て</option><option value="ceil" ${roundMode==='ceil'?'selected':''}>切り上げ</option></select></div></div><div class="field"><label>OCR貼り付けテキスト</label><textarea id="ri_paste" rows="5" placeholder="レシートOCRテキストを貼り付け">${esc(pasteText)}</textarea></div><div class="row" style="gap:6px"><button class="btn ghost sm" id="ri_parseV2">解析する</button><button class="btn ghost sm" id="ri_prompt">AI用プロンプトをコピー</button></div><details style="margin-top:8px"><summary>AI解析結果JSONを貼り付け</summary><div class="field"><label>AI返答JSON</label><textarea id="ri_ai" rows="5" placeholder='{"items":[...] }'>${esc(aiText)}</textarea></div><button class="btn ghost sm" id="ri_applyAI">AI結果を読み込む</button></details><div class="excel-tablewrap" style="margin-top:10px;max-height:42vh;overflow:auto"><table><thead><tr><th>使う</th><th>商品名</th><th>元価格</th><th>割引</th><th>税率</th><th>実質</th><th>カテゴリ</th></tr></thead><tbody id="ri_items">${items.map((it,i)=>`<tr data-i="${i}"><td><input class="ri_on" type="checkbox" ${it.enabled?'checked':''} style="width:auto"></td><td><input class="ri_name" value="${esc(it.name)}"></td><td><input class="ri_gross no-amount-pad" inputmode="decimal" value="${esc(it.gross)}"></td><td><input class="ri_disc no-amount-pad" inputmode="decimal" value="${esc(it.discount||0)}"></td><td><select class="ri_tax"><option value="" ${it.taxRate===''?'selected':''}>不明</option><option value="8" ${+it.taxRate===8?'selected':''}>8%</option><option value="10" ${+it.taxRate===10?'selected':''}>10%</option><option value="0" ${+it.taxRate===0?'selected':''}>0%</option></select></td><td class="num">${yen(receiptEffectiveNet(it,taxMode,roundMode))}</td><td><select class="ri_cat catsel"><option value="">未分類</option>${categoryOptions('expense', it.category)}</select></td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">解析結果がありません</td></tr>'}</tbody></table></div><div class="totline"><span>反映合計</span><span class="v" id="ri_total">${yen(total())}</span></div><div class="row" style="gap:6px;margin-top:8px"><select id="ri_bulk" class="catsel"><option value="">選択行にカテゴリ設定</option>${categoryOptions('expense')}</select><button class="btn ghost sm" id="ri_applyCat">設定</button></div><div class="balance-warn" id="ri_warn"></div><div class="actions"><button class="btn ghost" id="ri_cancel">キャンセル</button><button class="btn" id="ri_commit">明細へ反映</button></div>`;
      enhanceCatSelects($('#modal'));
      ['#ri_profile','#ri_taxMode','#ri_round'].forEach(s=>$(s).addEventListener('change',()=>{sync();draw();}));
      $('#ri_paste').addEventListener('input',()=>pasteText=$('#ri_paste').value);
      const upd=()=>{sync();draw();};
      $$('#ri_items input, #ri_items select').forEach(el=>el.addEventListener('change',upd));
      $('#ri_parseV2').addEventListener('click',()=>{sync();items=parseReceiptTextV2(pasteText,profile); if(!items.length)toast('明細候補を読み取れませんでした'); draw();});
      $('#ri_prompt').addEventListener('click',async()=>{sync();const prompt=buildReceiptAIPrompt(pasteText); try{await navigator.clipboard.writeText(prompt); toast('AI用プロンプトをコピーしました');}catch(e){$('#ri_warn').textContent='コピーできませんでした。プロンプト: '+prompt;}});
      $('#ri_applyAI').addEventListener('click',()=>{sync();try{items=receiptItemsFromAI(aiText); if(!items.length)return toast('AI結果にitemsがありません'); draw();}catch(e){toast('AI結果JSONを読めません: '+e.message);}});
      $('#ri_applyCat').addEventListener('click',()=>{sync();const cat=$('#ri_bulk').value;if(!cat)return toast('カテゴリを選んでください');items.forEach(it=>{if(it.enabled)it.category=cat;});draw();});
      $('#ri_cancel').addEventListener('click',closeModal);
      $('#ri_commit').addEventListener('click',()=>{sync();const valid=items.filter(x=>x.enabled&&x.name&&receiptEffectiveNet(x,taxMode,roundMode)>0);if(!valid.length)return toast('反映する明細がありません');const missing=valid.filter(x=>!x.category);if(missing.length){$('#ri_warn').textContent=`未分類の明細が ${missing.length} 件あります。カテゴリを設定してください。`;return;}const agg=new Map();valid.forEach(x=>{const amt=receiptEffectiveNet(x,taxMode,roundMode);agg.set(x.category,(agg.get(x.category)||0)+amt);});ui.exp.debits=[...agg.entries()].map(([path,amount])=>({path,amt:String(yenRound(amount)),ratio:''}));ui.exp.total=String(yenRound([...agg.values()].reduce((s,x)=>s+x,0)));closeModal();renderEntry();toast(`${valid.length}明細を${ui.exp.debits.length}カテゴリに集約しました ✓`);});
    };
    draw(); showModal();
  }
  function renderAllocTools() { const box = $('#allocTools'); if (!box) return; box.innerHTML = `<span class="lbl">按分:</span><button class="btn ghost sm" id="allocRest">残額を最終行へ</button><button class="btn ghost sm" id="allocEven">均等割り</button><label class="lbl" style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="ratioToggle" ${ui.exp.ratioMode ? 'checked' : ''} style="width:auto"> 割合入力</label>${ui.exp.ratioMode ? `<button class="btn ghost sm" id="allocRatio">割合で配分</button>` : ''}<button class="btn ghost sm" id="allocDup">前回この店の構成を複製</button>`; $('#allocRest').addEventListener('click', () => { syncExpFromDOM(); const tv = M.evalAmount(ui.exp.total); if (!ui.exp.total || Number.isNaN(tv)) return toast('購入合計を入れてください'); let sum = 0; for (let i = 0; i < ui.exp.debits.length - 1; i++) { const v = M.evalAmount(ui.exp.debits[i].amt); sum += Number.isNaN(v) ? 0 : v; } ui.exp.debits[ui.exp.debits.length - 1].amt = String(Math.round(tv - sum)); renderDebits(); recalcExpense(); }); $('#allocEven').addEventListener('click', () => { syncExpFromDOM(); const tv = M.evalAmount(ui.exp.total); if (!ui.exp.total || Number.isNaN(tv)) return toast('購入合計を入れてください'); const n = ui.exp.debits.length; const base = Math.floor(tv / n); const rem = tv - base * n; ui.exp.debits.forEach((d, i) => d.amt = String(base + (i < rem ? 1 : 0))); renderDebits(); recalcExpense(); }); $('#ratioToggle').addEventListener('change', e => { syncExpFromDOM(); ui.exp.ratioMode = e.target.checked; renderDebits(); renderAllocTools(); recalcExpense(); }); const ar = $('#allocRatio'); if (ar) ar.addEventListener('click', () => { syncExpFromDOM(); const tv = M.evalAmount(ui.exp.total); if (!ui.exp.total || Number.isNaN(tv)) return toast('購入合計を入れてください'); const weights = ui.exp.debits.map(d => { const w = M.evalAmount(d.ratio); return Number.isNaN(w) ? 0 : w; }); const wsum = weights.reduce((s, w) => s + w, 0); if (wsum <= 0) return toast('割合(重み)を入力してください'); let acc = 0; ui.exp.debits.forEach((d, i) => { if (i === ui.exp.debits.length - 1) d.amt = String(Math.round(tv - acc)); else { const v = Math.round(tv * weights[i] / wsum); d.amt = String(v); acc += v; } }); renderDebits(); recalcExpense(); }); $('#allocDup').addEventListener('click', () => { syncExpFromDOM(); const store = ui._store || ($('#f_store') ? $('#f_store').value : ''); if (!store) return toast('先に店名を入れてください'); const comp = M.lastStoreComposition(state, store); if (!comp) return toast('この店の過去の支出構成が見つかりません'); ui.exp.debits = comp.items.map(it => ({ path: it.catPath, amt: String(it.amount), ratio: '' })); renderDebits(); recalcExpense(); toast(`前回(${comp.date})の${comp.items.length}明細を複製しました`); }); }
  function renderCreditsExp() { const area = $('#creditArea'); if (!area) return; const opts = sel => accountOptions(a => a.subtype !== 'voucher_goods', sel); if (!ui.exp.detail) { const sel = ui.exp.credits[0] ? ui.exp.credits[0].accId : ''; area.innerHTML = `<div class="field"><label>支払手段（どこから）</label><select id="c_single">${opts(sel)}</select></div>`; return; } area.innerHTML = `<label>支払手段の内訳（貸方・複数可／カードのポイント払いもここで）</label>` + ui.exp.credits.map((c, i) => `<div class="credit-line" data-i="${i}"><div class="field" style="flex:2"><select class="c_acc">${opts(c.accId)}</select></div><div class="field amt"><input class="c_amt" inputmode="decimal" placeholder="金額(式可)" value="${esc(c.amt)}"></div><button class="btn ghost sm c_del">✕</button></div>`).join('') + `<button class="btn ghost sm" id="addCredit">＋貸方を追加</button>`; $$('.credit-line', area).forEach(line => { const i = +line.dataset.i; const acc = line.querySelector('.c_acc'), amt = line.querySelector('.c_amt'); acc.addEventListener('change', () => ui.exp.credits[i].accId = acc.value); amt.addEventListener('input', () => { ui.exp.credits[i].amt = amt.value; recalcExpense(); }); line.querySelector('.c_del').addEventListener('click', () => { syncExpFromDOM(); ui.exp.credits.splice(i, 1); if (!ui.exp.credits.length) ui.exp.credits.push({ accId: '', amt: '' }); renderCreditsExp(); recalcExpense(); }); }); $('#addCredit').addEventListener('click', () => { syncExpFromDOM(); ui.exp.credits.push({ accId: '', amt: '' }); renderCreditsExp(); recalcExpense(); }); attachHankakuAll(area); }
  function syncExpFromDOM() { $$('#debitArea .line-row').forEach(row => { const i = +row.dataset.i; const rat = row.querySelector('.d_ratio'); ui.exp.debits[i] = { path: row.querySelector('.d_cat').value, amt: row.querySelector('.d_amt').value, ratio: rat ? rat.value : (ui.exp.debits[i] ? ui.exp.debits[i].ratio : '') }; }); if (!ui.exp.detail) { const s = $('#c_single'); if (s) ui.exp.credits = [{ accId: s.value, amt: '' }]; } else $$('#creditArea .credit-line').forEach(line => { const i = +line.dataset.i; ui.exp.credits[i] = { accId: line.querySelector('.c_acc').value, amt: line.querySelector('.c_amt').value }; }); if ($('#f_total')) ui.exp.total = $('#f_total').value; if ($('#f_store')) ui._store = $('#f_store').value; if ($('#f_branch')) ui._branch = $('#f_branch').value; if ($('#f_date')) ui._date = $('#f_date').value; if ($('#f_memo')) ui._memo = $('#f_memo').value; }
  function debitSum() { return ui.exp.debits.reduce((s, d) => { const v = M.evalAmount(d.amt); return s + (Number.isNaN(v) ? 0 : v); }, 0); }
  function creditSum() { return ui.exp.credits.reduce((s, c) => { const v = M.evalAmount(c.amt); return s + (Number.isNaN(v) ? 0 : v); }, 0); }
  function recalcExpense() { $$('#debitArea .line-row').forEach(row => { const i = +row.dataset.i; ui.exp.debits[i].amt = row.querySelector('.d_amt').value; ui.exp.debits[i].path = row.querySelector('.d_cat').value; }); const dsum = debitSum(); const tEl = $('#debitTotal'); if (tEl) tEl.textContent = yen(dsum); const totalRaw = $('#f_total') ? $('#f_total').value.trim() : ''; const info = $('#allocInfo'); if (totalRaw && info) { const tv = M.evalAmount(totalRaw); if (!Number.isNaN(tv)) { const un = tv - dsum; info.innerHTML = `/ 目標 ${yen(tv)} ・ 未割当 <b style="color:${Math.abs(un) < 0.5 ? 'var(--accent2)' : 'var(--warn)'}">${yen(un)}</b>`; } else info.textContent = ''; } else if (info) info.textContent = ''; const warn = $('#warn'); if (warn) { if (ui.exp.detail) { $$('#creditArea .credit-line').forEach(line => { const i = +line.dataset.i; ui.exp.credits[i].amt = line.querySelector('.c_amt').value; }); const cs = creditSum(); warn.textContent = (dsum && Math.abs(cs - dsum) > 0.5) ? `⚠ 貸方合計 ${yen(cs)} が明細合計 ${yen(dsum)} と一致していません（差 ${yen(dsum - cs)}）` : ''; } else warn.textContent = ''; } }
  function renderStoreChips() { const box = $('#storeChips'); if (!box) return; const store = $('#f_store') ? $('#f_store').value.trim() : ''; const stats = M.storeCategoryStats(state, store).slice(0, 6); if (!store || !stats.length) { box.innerHTML = ''; return; } box.innerHTML = `<span class="muted" style="font-size:12px; align-self:center">よく使う:</span>` + stats.map(s => { const lbl = s.path.replace(/^exp>/, '').split('>').slice(-1)[0]; return `<button class="chip-btn" data-path="${s.path}">${esc(lbl)} <span class="muted">×${s.n}</span></button>`; }).join('') + `<button class="chip-btn" id="chipFillAll" style="border-color:var(--accent); color:var(--accent)">全部を明細に</button>`; $$('.chip-btn[data-path]', box).forEach(b => b.addEventListener('click', () => addDebitPath(b.dataset.path))); const fa = $('#chipFillAll'); if (fa) fa.addEventListener('click', () => { syncExpFromDOM(); ui.exp.debits = ui.exp.debits.filter(d => d.path || d.amt); stats.forEach(s => { if (!ui.exp.debits.some(d => d.path === s.path)) ui.exp.debits.push({ path: s.path, amt: '', ratio: '' }); }); if (!ui.exp.debits.length) ui.exp.debits.push({ path: '', amt: '', ratio: '' }); renderDebits(); recalcExpense(); }); }
  function addDebitPath(path) { syncExpFromDOM(); const e = ui.exp.debits.find(d => !d.path && !d.amt); if (e) e.path = path; else ui.exp.debits.push({ path, amt: '', ratio: '' }); renderDebits(); recalcExpense(); }
  let storeTimer = null;
  function onStoreInput() { const store = $('#f_store').value.trim(); if (store && $('#f_branch') && !$('#f_branch').value) { const b = M.storeBranchDefault(state, store); if (b) $('#f_branch').value = b; } clearTimeout(storeTimer); storeTimer = setTimeout(renderStoreChips, 150); }
  function renderPrepaidFields() { const host = $('#prepaidFields'); if (!host) return; const acc = accById($('#f_to').value); const sub = acc ? acc.subtype : 'voucher_amount'; const pp = ui._prepaid || {}; if (sub === 'voucher_goods') { host.innerHTML = `<div class="row"><div class="field"><label>支払額（実際に払った合計）</label><input type="number" id="p_paid" value="${pp.paid || ''}" placeholder="例: 5000"></div><div class="field"><label>枚数</label><input type="number" id="p_qty" value="${pp.qty || ''}" placeholder="例: 11"></div></div><p class="hint" id="p_unit">原価主義：1枚あたり原価で費用化されます。</p>`; const upd = () => { const paid = +$('#p_paid').value, q = +$('#p_qty').value; $('#p_unit').textContent = (paid && q) ? `原価主義：1枚 = ${yen(paid / q)}（利用時にこの単価で費用化）` : '原価主義：1枚あたり原価で費用化されます。'; }; $('#p_paid').addEventListener('input', upd); $('#p_qty').addEventListener('input', upd); upd(); } else { host.innerHTML = `<div class="row"><div class="field"><label>額面（資産計上額）</label><input type="number" id="p_face" value="${pp.face || ''}" placeholder="例: 6050"></div><div class="field"><label>支払額（実際に払った額）</label><input type="number" id="p_paid" value="${pp.paid || ''}" placeholder="例: 5000"></div></div><p class="hint" id="p_prem">金額型：差額はプレミアム益(収入)に計上されます。</p>`; const upd = () => { const f = +$('#p_face').value, p = +$('#p_paid').value; $('#p_prem').textContent = (f && p) ? `プレミアム益 = ${yen(f - p)}（額面 ${yen(f)} − 支払 ${yen(p)}）` : '金額型：差額はプレミアム益(収入)に計上されます。'; }; $('#p_face').addEventListener('input', upd); $('#p_paid').addEventListener('input', upd); upd(); } attachHankakuAll(host); }
  function renderEditBanner() { const b = $('#editBanner'); if (!b) return; const nextMsg = ui.editNextId ? '更新後、次の取引を自動で開きます。' : '更新後、この編集を終了します。'; b.innerHTML = ui.editId ? `<div class="edit-banner"><span>✏️ 取引を編集中です。${nextMsg}</span><button class="btn ghost sm" id="cancelEdit">編集をやめる</button></div>` : ''; const c = $('#cancelEdit'); if (c) c.addEventListener('click', () => { resetEntryState(); renderEntry(); toast('編集をやめました'); }); }

  function onSubmit() {
    const type = ui.type; const nextEditId = ui.editNextId; const store = $('#f_store') ? $('#f_store').value : ''; const branch = $('#f_branch') ? $('#f_branch').value : ''; const date = $('#f_date') ? $('#f_date').value : M.todayStr(); const memo = $('#f_memo') ? $('#f_memo').value : ''; const id = ui.editId; let t;
    try {
      if (type === 'expense') {
        syncExpFromDOM();
        const rows = ui.exp.debits.filter(d => d.path);
        const parsed = rows.map(d => ({ catPath: d.path, raw: (d.amt || '').trim(), amount: M.evalAmount(d.amt) }));
        const invalid = parsed.filter(p => p.raw !== '' && Number.isNaN(p.amount));
        parsed.forEach(p => { if (!Number.isNaN(p.amount)) p.amount = yenRound(p.amount); }); const validItems = parsed.filter(p => p.raw !== '' && !Number.isNaN(p.amount) && p.amount);
        if (!validItems.length) return toast('金額のある明細を1行以上入力してください');
        if (invalid.length) { if (!confirm(`⚠ 不正な金額の明細が ${invalid.length}件あります（例: "${invalid[0].raw}"）。\nその行を除いて登録しますか？`)) return; }
        const items = validItems.map(p => ({ catPath: p.catPath, amount: p.amount }));
        const dsum = items.reduce((s, it) => s + it.amount, 0);
        let credits;
        if (ui.exp.detail) { const cInvalid = ui.exp.credits.filter(c => c.accId && (c.amt || '').trim() !== '' && Number.isNaN(M.evalAmount(c.amt))); if (cInvalid.length) { if (!confirm(`⚠ 支払手段に不正な金額があります。その行を除いて登録しますか？`)) return; } credits = ui.exp.credits.map(c => ({ accId: c.accId, amount: evalYen(c.amt) })).filter(c => c.accId && c.amount && !Number.isNaN(c.amount)); const cs = credits.reduce((s, c) => s + c.amount, 0); if (Math.abs(cs - dsum) > 0.5) return toast(`貸方合計 ${yen(cs)} が明細合計 ${yen(dsum)} と一致しません`); } else { const accId = $('#c_single').value; if (!accId) return toast('支払手段を選んでください'); credits = [{ accId, amount: dsum }]; }
        t = M.buildExpense({ id, date, items, credits, store, branch, memo });
      }
      else if (type === 'income') { const amount = M.evalAmount($('#f_amount').value); if (!amount || Number.isNaN(amount)) return toast('金額を確認してください'); t = M.buildIncome({ id, date, accId: $('#f_acc').value, catPath: $('#f_cat').value, amount, store, branch, memo }); }
      else if (type === 'transfer') { const amount = M.evalAmount($('#f_amount').value); if (!amount || Number.isNaN(amount)) return toast('金額を確認してください'); if ($('#f_from').value === $('#f_to').value) return toast('移動元と移動先が同じです'); t = M.buildTransfer({ id, date, fromAccId: $('#f_from').value, toAccId: $('#f_to').value, amount, store, branch, memo }); }
      else if (type === 'prepaid') { const acc = accById($('#f_to').value), fromAccId = $('#f_from').value; if (acc.subtype === 'voucher_goods') { const paid = +$('#p_paid').value, qty = +$('#p_qty').value; if (!paid || !qty) return toast('支払額と枚数を入力してください'); t = M.buildPrepaidGoods({ id, date, toAccId: acc.id, paid, qty, fromAccId, store, branch, memo }); } else { const face = +$('#p_face').value, paid = +$('#p_paid').value; if (!face || !paid) return toast('額面と支払額を入力してください'); t = M.buildPrepaidAmount({ id, date, toAccId: acc.id, face, paid, fromAccId, store, branch, memo }); } }
      else if (type === 'goods_use') { const acc = accById($('#f_goods').value), qty = +$('#f_qty').value || 1; let unit; if (id && ui._goods) unit = ui._goods.unitCost; else { const have = M.goodsQty(state, acc.id); if (qty > have) return toast('残数が足りません'); unit = have > 0 ? M.accountBalance(state, acc.id) / have : 0; } t = M.buildGoodsUse({ id, date, catPath: $('#f_cat').value, fromAccId: acc.id, unitCost: unit, qty, store, branch, memo }); }
    } catch (e) { console.error(e); return toast('入力エラー: ' + e.message); }
    const errs = M.validateTransaction(t); if (errs.length) { if (!confirm('⚠ ' + errs.join(' / ') + '\nこのまま登録しますか？')) return; }
    if (id) { const idx = state.transactions.findIndex(x => x.id === id); if (idx >= 0) state.transactions[idx] = t; toast('更新しました ✓'); } else { state.transactions.push(t); toast('記帳しました ✓'); }
    persist(); refreshDatalists(); const keepDate = ui._date; resetEntryState(); ui._date = keepDate; renderEntry(); renderList(); renderAccounts(); renderReport(); renderCards(); renderDrill(); renderBudget(); if (id && nextEditId && state.transactions.some(x=>x.id===nextEditId)) { setTimeout(()=>loadForEdit(nextEditId), 0); }
  }

  function nextEditIdFor(id) { const rows = filteredRows(); const i = rows.findIndex(t => t.id === id); return i >= 0 && i + 1 < rows.length ? rows[i + 1].id : null; }

  function loadForEdit(id) {
    const t = state.transactions.find(x => x.id === id); if (!t) return;
    if (t.kind === 'card_payment') { openCardPayEditModal(t); return; }
    const keepDate = ui._date; resetEntryState(); ui.editId = id; ui.editNextId = nextEditIdFor(id); ui._store = t.store; ui._branch = t.branch; ui._date = t.date; ui._memo = t.memo;
    const debits = t.lines.filter(l => l.amount > 0), credits = t.lines.filter(l => l.amount < 0);
    if (t.kind === 'expense') { ui.type = 'expense'; ui.exp.debits = debits.filter(l => l.ref.startsWith('cat:')).map(l => ({ path: l.ref.slice(4), amt: String(l.amount), ratio: '' })); ui.exp.total = String(debits.filter(l => l.ref.startsWith('cat:')).reduce((sum, l) => sum + l.amount, 0)); const accC = credits.filter(l => l.ref.startsWith('acc:')); ui.exp.credits = accC.map(l => ({ accId: l.ref.slice(4), amt: String(-l.amount) })); ui.exp.detail = accC.length > 1; if (!ui.exp.debits.length) ui.exp.debits = [{ path: '', amt: '', ratio: '' }]; }
    else if (t.kind === 'income') { ui.type = 'income'; ui._accId = debits[0] ? debits[0].ref.slice(4) : ''; const cat = credits.find(l => l.ref.startsWith('cat:')); ui._catPath = cat ? cat.ref.slice(4) : ''; ui._amt = String((debits[0] || { amount: '' }).amount); }
    else if (t.kind === 'transfer') { ui.type = 'transfer'; ui._toId = debits[0] ? debits[0].ref.slice(4) : ''; ui._fromId = credits[0] ? credits[0].ref.slice(4) : ''; ui._amt = String((debits[0] || { amount: '' }).amount); }
    else if (t.kind === 'prepaid_amount') { ui.type = 'prepaid'; const cc = credits.find(l => l.ref.startsWith('acc:')); ui._prepaid = { toId: debits[0].ref.slice(4), fromId: cc ? cc.ref.slice(4) : '', face: debits[0].amount, paid: cc ? -cc.amount : debits[0].amount }; }
    else if (t.kind === 'prepaid_goods') { ui.type = 'prepaid'; const cc = credits.find(l => l.ref.startsWith('acc:')); ui._prepaid = { toId: debits[0].ref.slice(4), fromId: cc ? cc.ref.slice(4) : '', paid: debits[0].amount, qty: debits[0].qty }; }
    else if (t.kind === 'goods_use') { ui.type = 'goods_use'; const cat = debits.find(l => l.ref.startsWith('cat:')); const gc = credits.find(l => l.qty != null); const qty = gc ? -gc.qty : 1; const unitCost = gc ? (-gc.amount) / (-gc.qty) : 0; ui._goods = { goodsId: gc ? gc.ref.slice(4) : '', qty, catPath: cat ? cat.ref.slice(4) : '', unitCost }; }
    else { ui.editId = null; ui._date = keepDate; toast('この種別は編集非対応です'); return; }
    switchTab('entry'); renderEntry(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openCardPayEditModal(t) { const cardId = t.meta.cardAccId; const credits = t.lines.filter(l => l.amount < 0).map(l => ({ accId: l.ref.slice(4), amount: -l.amount })); const cyc = M.cardCycles(state, cardId).find(c => c.key === t.meta.cycleKey); const outstanding = cyc ? cyc.charge - (cyc.paid - credits.reduce((s, c) => s + c.amount, 0)) : credits.reduce((s, c) => s + c.amount, 0); payModalContent('カード引落の編集', cardId, t.meta.cycleKey, t.meta.payDate, outstanding, t.date, credits, t.id); showModal(); }

