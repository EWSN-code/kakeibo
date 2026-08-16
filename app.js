/* =====================================================================
 * app.js ― UI / イベント / 状態管理  (v1.3)
 *  入力からサマリ撤去 / 「分析」タブ（収支=俯瞰・費用/収入=ドリル）
 *  下タブ＋ドロワー / カテゴリ2行 / ほしいもの・価格分離（v1.1踏襲）
 * ===================================================================== */
(function () {
  'use strict';
  const M = window.Model;
  const Store = window.StorageAdapter;

  let state = Store.load();
  state = state ? M.migrate(state) : M.makeDummy();

  const THEME_KEY = 'kakeibo_theme_v1';
  const THEME_PRESETS = {
    midnight: { label: 'Midnight', bg: '#0f1216', panel: '#171b22', panel2: '#1e232c', line: '#2a313c', text: '#e8ecf1', muted: '#93a0b0', chip: '#232a34' },
    graphite: { label: 'Graphite', bg: '#111111', panel: '#1b1b1b', panel2: '#262626', line: '#383838', text: '#eeeeee', muted: '#a2a2a2', chip: '#2f2f2f' },
    deepblue: { label: 'Deep Blue', bg: '#08111f', panel: '#101b2c', panel2: '#182842', line: '#28405f', text: '#e9f1ff', muted: '#9aaec7', chip: '#1e314d' },
    forest: { label: 'Forest', bg: '#0c1511', panel: '#14201a', panel2: '#1c2b23', line: '#2d4438', text: '#e9f4ee', muted: '#9bb2a4', chip: '#21362b' }
  };
  function loadTheme() { try { return JSON.parse(localStorage.getItem(THEME_KEY) || '{}'); } catch(e) { return {}; } }
  function saveTheme(t) { localStorage.setItem(THEME_KEY, JSON.stringify(t)); }
  function applyTheme(theme) {
    theme = theme || loadTheme();
    const presetName = theme.preset || 'midnight';
    const preset = THEME_PRESETS[presetName] || THEME_PRESETS.midnight;
    const root = document.documentElement;
    Object.entries(preset).forEach(([k, v]) => { if (k !== 'label') root.style.setProperty('--' + k, v); });
    const accent = theme.accent || '#4f9dff';
    root.style.setProperty('--accent', accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preset.bg);
  }
  applyTheme();

  let ui = {};
  function resetEntryState() {
    ui.editId = null; ui.editNextId = null;
    ui.exp = { debits: [{ path: '', amt: '', ratio: '' }], credits: [{ accId: '', amt: '' }], detail: false, total: '', ratioMode: false };
    ui._store = ''; ui._branch = ''; ui._memo = ''; ui._date = ui._date || M.todayStr();
    ui._amt = ''; ui._catPath = ''; ui._accId = ''; ui._fromId = ''; ui._toId = '';
    ui._prepaid = null; ui._goods = null;
  }
  ui._date = M.todayStr(); ui.type = 'expense'; resetEntryState();

  let drill = { kind: 'net', parts: [], leaf: null };   // 既定=収支(net)
  let selected = new Set();
  let simSurplus = null;
  let wishFilter = { tag: null, status: 'active' };
  let priceOpen = new Set(), priceShowAll = new Set(), priceRange = {};
  const PALETTE = ['#4f9dff', '#38c793', '#ffb454', '#ff6b6b', '#a78bfa', '#22d3ee', '#f472b6', '#84cc16', '#fb923c', '#94a3b8', '#eab308', '#2dd4bf'];

  function persist() { Store.save(state); }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function el(tag, attrs) { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); } return e; }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2000); }
  const yen = M.yen;
  function yenRound(v) { return Math.round(Number(v) || 0); }
  function evalYen(raw) { const v = M.evalAmount(raw); return Number.isNaN(v) ? NaN : yenRound(v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function isNarrow() { return window.matchMedia('(max-width:760px)').matches; }

  /* ---- 全角→半角 ---- */
  function attachHankaku(input) {
    if (!input || input.dataset.hk) return; input.dataset.hk = '1';
    input.addEventListener('blur', () => { const h = M.toHankaku(input.value); if (h !== input.value) { input.value = h; input.dispatchEvent(new Event('input', { bubbles: true })); } });
    input.addEventListener('input', () => { if (/[０-９．，＋－＊×／（）]/.test(input.value)) { const p = input.selectionStart; const h = M.toHankaku(input.value); if (h !== input.value) { input.value = h; try { input.setSelectionRange(p, p); } catch (e) { } } } });
  }
  function attachHankakuAll(root) { $$('input[inputmode="decimal"], input[inputmode="numeric"], input[type="number"]', root || document).forEach(attachHankaku); }

  /* ---- オートコンプリート（店名/支店/品目） ---- */
  function attachAC(input, getCands) {
    if (!input || input.dataset.ac) return; input.dataset.ac = '1';
    const wrap = el('div', { class: 'ac-wrap' }); input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    const pop = el('div', { class: 'ac-pop' }); wrap.appendChild(pop);
    let items = [], active = -1, composing = false; input._yomiParts = []; input._curYomi = '';
    const close = () => { pop.classList.remove('show'); active = -1; };
    const render = () => { const q = input.value; items = q ? M.matchCandidates(getCands(), q, 8, state.readings).filter(c => c !== q) : []; if (!items.length) { close(); return; } pop.innerHTML = items.map((c, i) => `<div class="ac-item ${i === active ? 'active' : ''}" data-i="${i}">${esc(c)}</div>`).join(''); pop.classList.add('show'); $$('.ac-item', pop).forEach(it => it.addEventListener('mousedown', e => { e.preventDefault(); choose(+it.dataset.i); })); };
    const choose = i => { if (i < 0 || i >= items.length) return; input.value = items[i]; input._yomiParts = []; close(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
    const saveReading = () => { const reading = (input._yomiParts || []).join(''); const val = input.value.trim(); if (reading && val && M.normReading(reading) !== M.normReading(val)) { state.readings[val] = reading; } input._yomiParts = []; };
    input.addEventListener('compositionstart', () => composing = true);
    input.addEventListener('compositionupdate', e => { if (e.data && /[ぁ-ん]/.test(e.data) && /^[぀-ゟーｰ\u30fc\s]+$/.test(e.data)) input._curYomi = e.data; });
    input.addEventListener('compositionend', e => { composing = false; if (input._curYomi) { input._yomiParts.push(input._curYomi); input._curYomi = ''; } render(); });
    input.addEventListener('input', () => { if (!composing) render(); });
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => { saveReading(); setTimeout(close, 120); });
    input.addEventListener('change', saveReading);
    input.addEventListener('keydown', e => { if (!pop.classList.contains('show')) return; if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); } else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); choose(active); } } else if (e.key === 'Escape') close(); });
  }
  function storeCands() { const s = new Set(); state.transactions.forEach(t => { if (t.store) s.add(t.store); }); (state.priceLogs || []).forEach(p => { if (p.store) s.add(p.store); }); state.wishlist.forEach(w => { if (w.store) s.add(w.store); }); return [...s]; }
  function branchCands() { const s = new Set(); state.transactions.forEach(t => { if (t.branch) s.add(t.branch); }); return [...s]; }
  function itemCands() { const s = new Set(); (state.priceLogs || []).forEach(p => { if (p.item) s.add(p.item); }); return [...s]; }

  /* ---- カテゴリ検索コンボ（2行表示・狭画面は小カテゴリのみ） ---- */
  function catLeaf(label) { const p = label.split(' › '); return p[p.length - 1]; }
  function catHead(label) { const p = label.split(' › '); return p.slice(0, -1).join(' › '); }
  function enhanceCatSelects(root) {
    $$('select.catsel', root || document).forEach(sel => {
      if (sel.dataset.enh) return; sel.dataset.enh = '1';
      const opts = Array.from(sel.options).map(o => ({ value: o.value, label: o.textContent }));
      const wrap = el('div', { class: 'catcombo' }); sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.classList.add('cc-native');
      const input = el('input', { class: 'cc-input', type: 'text', placeholder: 'カテゴリを検索…' });
      const disp = o => o ? (isNarrow() ? catLeaf(o.label) : o.label) : '';
      const cur = opts.find(o => o.value === sel.value); input.value = disp(cur);
      const pop = el('div', { class: 'ac-pop' }); wrap.appendChild(input); wrap.appendChild(pop);
      let items = [], active = -1, composing = false;
      const close = () => { pop.classList.remove('show'); active = -1; };
      const commit = o => { sel.value = o.value; input.value = disp(o); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); };
      const render = () => { const q = input.value.trim(); const qn = M.normReading(q); items = !q ? opts.slice(0, 60) : opts.filter(o => o.label.includes(q) || M.normReading(o.label).includes(qn)); items = items.slice(0, 60); if (!items.length) { close(); return; } pop.innerHTML = items.map((o, i) => { const h = catHead(o.label), lf = catLeaf(o.label); return `<div class="ac-item ${i === active ? 'active' : ''}" data-i="${i}">${h ? `<div class="cc-head">${esc(h)}</div>` : ''}<div class="cc-leaf">${esc(lf)}</div></div>`; }).join(''); pop.classList.add('show'); $$('.ac-item', pop).forEach(it => it.addEventListener('mousedown', e => { e.preventDefault(); commit(items[+it.dataset.i]); })); };
      input.addEventListener('compositionstart', () => composing = true);
      input.addEventListener('compositionend', () => { composing = false; render(); });
      input.addEventListener('input', () => { if (!composing) render(); });
      input.addEventListener('focus', () => { input.select && input.select(); render(); });
      input.addEventListener('blur', () => setTimeout(() => { const c = opts.find(o => o.value === sel.value); if (c) input.value = disp(c); close(); }, 150));
      input.addEventListener('keydown', e => { if (!pop.classList.contains('show')) return; if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); } else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); commit(items[active]); } } else if (e.key === 'Escape') close(); });
    });
  }
  function addAmountPadButtons(root) {
    const host = root || document;
    if (host.id === 'modal') return;
    $$('input[inputmode="decimal"], input[type="number"]', host).forEach(input => {
      if (input.dataset.padReady || input.classList.contains('no-amount-pad')) return;
      if (input.type === 'date' || input.type === 'month' || input.type === 'checkbox') return;
      input.dataset.padReady = '1';
      const btn = el('button', { class: 'btn ghost sm amount-pad-btn', type: 'button', title: '金額パッド' });
      btn.textContent = '🧮';
      btn.addEventListener('click', e => { e.preventDefault(); openAmountPad(input); });
      input.insertAdjacentElement('afterend', btn);
    });
  }
  function openAmountPad(target) {
    const start = M.toHankaku(target.value || '');
    $('#modal').innerHTML = `<h3>金額パッド</h3><div class="field"><label>式・金額</label><input id="kp_display" class="no-amount-pad" inputmode="decimal" value="${esc(start)}" placeholder="例: 980*1.08"></div><div class="amt-eval" id="kp_eval"></div><div class="keypad" id="kp_keys"></div><div class="actions"><button class="btn ghost" id="kp_cancel">キャンセル</button><button class="btn" id="kp_ok">入力する</button></div>`;
    const disp = $('#kp_display'), ev = $('#kp_eval'), keys = $('#kp_keys');
    const upd = () => { const raw = M.toHankaku(disp.value).trim(); if (!raw) { ev.textContent = ''; return; } const v = M.evalAmount(raw); ev.textContent = Number.isNaN(v) ? '⚠ 式が不正です' : '= ' + yen(v); };
    const keyList = ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','⌫','+','C','(',')','OK'];
    keys.innerHTML = keyList.map(k => `<button class="btn ${k==='OK'?'':'ghost'} sm" data-k="${k}" type="button">${k}</button>`).join('');
    $$('[data-k]', keys).forEach(b => b.addEventListener('click', () => { const k = b.dataset.k; if (k === 'OK') { $('#kp_ok').click(); return; } if (k === 'C') disp.value = ''; else if (k === '⌫') disp.value = disp.value.slice(0, -1); else disp.value += k; upd(); disp.focus(); }));
    disp.addEventListener('input', upd); upd();
    $('#kp_cancel').addEventListener('click', closeModal);
    $('#kp_ok').addEventListener('click', () => { target.value = M.toHankaku(disp.value).trim(); target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); closeModal(); });
    showModal(); setTimeout(() => disp.focus(), 0);
  }
  function decorateInputs(root) {
    attachHankakuAll(root);
    ['#f_store', '#pl_store', '#wi_store'].forEach(sel => { const i = $(sel, root || document); if (i) attachAC(i, storeCands); });
    ['#f_branch', '#pl_branch'].forEach(sel => { const i = $(sel, root || document); if (i) attachAC(i, branchCands); });
    const it = $('#pl_item', root || document); if (it) attachAC(it, itemCands);
    enhanceCatSelects(root);
    addAmountPadButtons(root);
  }

  function accountsBy(fn) { return state.accounts.filter(fn); }
  function accById(id) { return state.accounts.find(a => a.id === id); }
  function accName(id) { const a = accById(id); return a ? a.name : id; }
  function refLabel(ref) { if (ref.startsWith('acc:')) return accName(ref.slice(4)); if (ref.startsWith('cat:')) return ref.slice(4).replace(/^exp>|^inc>/, '').split('>').join(' › '); return ref; }
  function accountOptions(filter, selected) { return accountsBy(a => !filter || filter(a)).map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}（${M.ACCOUNT_SUBTYPES[a.subtype].label}）</option>`).join(''); }
  function categoryOptions(kind, selected) { return M.flattenCategories(state.categories, kind).map(c => `<option value="${c.path}" ${c.path === selected ? 'selected' : ''}>${c.label}</option>`).join(''); }
  function refreshDatalists() { const stores = new Set(), branches = new Set(), items = new Set(); state.transactions.forEach(t => { if (t.store) stores.add(t.store); if (t.branch) branches.add(t.branch); }); (state.priceLogs || []).forEach(p => { if (p.item) items.add(p.item); if (p.store) stores.add(p.store); }); $('#dl-store').innerHTML = [...stores].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-branch').innerHTML = [...branches].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-item').innerHTML = [...items].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-top').innerHTML = Object.keys(state.categories.expense).map(s => `<option value="${esc(s)}">`).join(''); }

  function currentYM() { return $('#ym').value || M.curYM(); }
  function shiftMonth(delta) { const [y, m] = currentYM().split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); $('#ym').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); onMonthChange(); }
  function onMonthChange() { renderReport(); renderDrill(); renderBudget(); renderGoals(); if (!$('#tab-list').hidden) { $('#fltYm').value = currentYM(); renderList(); } }

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

  /* ============ 取引一覧 ============ */
  const KIND_TAG = { expense: ['exp', '支出'], income: ['inc', '収入'], transfer: ['mv', '振替'], card_payment: ['mv', 'カード引落'], prepaid_amount: ['mv', '前払(金)'], prepaid_goods: ['mv', '前払(物)'], goods_use: ['exp', '現物利用'], generic: ['mv', '—'] };
  function txPositiveAmount(t) { return t.lines.filter(l => l.amount > 0).reduce((sum, l) => sum + l.amount, 0); }
  function filteredRows() { const ym = $('#fltYm').value, catTop = $('#fltCat').value, kind = $('#fltKind').value, kw = ($('#fltText').value || '').trim(), sort = ($('#fltSort') ? $('#fltSort').value : 'date_desc'); let rows = state.transactions.slice(); if (ym) rows = rows.filter(t => t.date.startsWith(ym)); if (catTop) rows = rows.filter(t => t.lines.some(l => l.ref.startsWith('cat:') && l.ref.includes('>' + catTop))); if (kind) rows = rows.filter(t => t.kind === kind); if (kw) rows = rows.filter(t => { const catText = t.lines.filter(l => l.ref.startsWith('cat:')).map(l => l.ref.slice(4)).join(' '); return (t.store + ' ' + t.branch + ' ' + t.memo + ' ' + catText).includes(kw); }); const cmpDateAsc = (a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id); const cmpAmtAsc = (a,b)=>txPositiveAmount(a)-txPositiveAmount(b)||cmpDateAsc(a,b); rows.sort((a,b)=> sort==='date_asc'?cmpDateAsc(a,b):sort==='amount_desc'?cmpAmtAsc(b,a):sort==='amount_asc'?cmpAmtAsc(a,b):cmpDateAsc(b,a)); return rows; }
  function renderList() {
    if (!$('#fltKind').dataset.filled) { $('#fltKind').innerHTML = `<option value="">すべて</option>` + Object.entries(KIND_TAG).filter(([k]) => k !== 'generic').map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join(''); $('#fltKind').dataset.filled = '1'; }
    if (!$('#fltCat').dataset.filled) { const tops = [...new Set(Object.keys(state.categories.expense).concat(Object.keys(state.categories.income)))]; $('#fltCat').innerHTML = `<option value="">すべて</option>` + tops.map(t => `<option>${t}</option>`).join(''); $('#fltCat').dataset.filled = '1'; }
    const rows = filteredRows(); const rowIds = new Set(rows.map(r => r.id)); selected.forEach(id => { if (!rowIds.has(id)) selected.delete(id); });
    const tbody = $('#txTable tbody');
    tbody.innerHTML = rows.map(t => { const debit = t.lines.filter(l => l.amount > 0).map(l => refLabel(l.ref)).join(', '); const credit = t.lines.filter(l => l.amount < 0).map(l => refLabel(l.ref) + (l.qty ? `(${-l.qty}枚)` : '')).join(' + '); const amt = t.lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0); const [cls, lab] = KIND_TAG[t.kind] || KIND_TAG.generic; return `<tr class="${selected.has(t.id) ? 'sel' : ''}" data-id="${t.id}"><td class="chk"><input type="checkbox" class="rowchk" ${selected.has(t.id) ? 'checked' : ''}></td><td>${t.date}</td><td><span class="tag ${cls}">${lab}</span></td><td>${esc(debit)}</td><td class="muted">${esc(credit)}</td><td>${esc(t.store)}${t.branch ? ' <span class="muted">/ ' + esc(t.branch) + '</span>' : ''}</td><td class="num">${yen(amt)}</td><td style="white-space:nowrap"><button class="btn ghost sm" data-edit="${t.id}">編集</button> <button class="btn danger sm" data-del="${t.id}">削除</button></td></tr>`; }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center; padding:20px">取引がありません</td></tr>`;
    $$('.rowchk', tbody).forEach(chk => chk.addEventListener('change', e => { const id = e.target.closest('tr').dataset.id; if (e.target.checked) selected.add(id); else selected.delete(id); e.target.closest('tr').classList.toggle('sel', e.target.checked); renderBulkBar(); syncChkAll(rows); }));
    $$('[data-del]', tbody).forEach(b => b.addEventListener('click', () => { if (!confirm('この取引を削除しますか？')) return; state.transactions = state.transactions.filter(t => t.id !== b.dataset.del); selected.delete(b.dataset.del); persist(); renderList(); renderAccounts(); renderReport(); renderCards(); renderDrill(); renderBudget(); toast('削除しました'); }));
    $$('[data-edit]', tbody).forEach(b => b.addEventListener('click', () => loadForEdit(b.dataset.edit)));
    syncChkAll(rows); renderBulkBar();
  }
  function gotoListWithKeyword(kw) { switchTab('list'); $('#fltYm').value = ''; $('#fltCat').value = ''; $('#fltKind').value = ''; $('#fltText').value = kw; renderList(); toast(`「${kw}」で取引を検索`); }
  function syncChkAll(rows) { const all = $('#chkAll'); if (!all) return; const n = rows.length; const sel = rows.filter(r => selected.has(r.id)).length; all.checked = n > 0 && sel === n; all.indeterminate = sel > 0 && sel < n; }
  function renderBulkBar() { const bar = $('#bulkBar'); if (!bar) return; if (!selected.size) { bar.innerHTML = ''; return; } bar.innerHTML = `<div class="bulkbar"><span class="cnt">${selected.size}件を選択中</span><span class="spacer"></span><button class="btn ghost sm" id="bulkRecat">カテゴリを付け替え</button><button class="btn danger sm" id="bulkDel">一括削除</button><button class="btn ghost sm" id="bulkClear">選択解除</button></div>`; $('#bulkClear').addEventListener('click', () => { selected.clear(); renderList(); }); $('#bulkDel').addEventListener('click', () => { if (!confirm(`選択した ${selected.size}件を削除します。よろしいですか？`)) return; state.transactions = state.transactions.filter(t => !selected.has(t.id)); selected.clear(); persist(); renderList(); renderAccounts(); renderReport(); renderCards(); renderDrill(); renderBudget(); toast('一括削除しました ✓'); }); $('#bulkRecat').addEventListener('click', openBulkRecatModal); }
  function openBulkRecatModal() {
    const ids = [...selected]; const targets = state.transactions.filter(t => ids.includes(t.id)); const fromSet = new Map();
    targets.forEach(t => t.lines.forEach(l => { if (l.ref.startsWith('cat:exp>')) { const p = l.ref.slice(4); fromSet.set(p, (fromSet.get(p) || 0) + 1); } }));
    if (!fromSet.size) return toast('費用カテゴリを持つ取引が選択されていません');
    const fromOpts = [...fromSet.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `<option value="${p}">${p.replace(/^exp>/, '').split('>').join(' › ')}（${n}件）</option>`).join('');
    $('#modal').innerHTML = `<h3>カテゴリの一括付け替え（選択カテゴリのみ）</h3><p class="hint">選択した取引の中で、<b>付け替え元</b>に一致する費用明細だけを<b>付け替え先</b>に変更します。分割明細の他カテゴリはそのまま保持されます。</p><div class="field"><label>付け替え元カテゴリ</label><select id="brc_from">${fromOpts}</select></div><div class="field"><label>付け替え先カテゴリ</label><select id="brc_to" class="catsel">${categoryOptions('expense')}</select></div><div class="actions"><button class="btn ghost" id="brc_cancel">キャンセル</button><button class="btn" id="brc_ok">付け替える</button></div>`;
    $('#brc_cancel').addEventListener('click', closeModal);
    $('#brc_ok').addEventListener('click', () => { const fromRef = 'cat:' + $('#brc_from').value, toRef = 'cat:' + $('#brc_to').value; if (fromRef === toRef) { closeModal(); return toast('付け替え元と先が同じです'); } let cnt = 0; targets.forEach(t => { let changed = false; t.lines.forEach(l => { if (l.ref === fromRef) { l.ref = toRef; changed = true; } }); if (changed) { const merged = {}; const order = []; const others = []; t.lines.forEach(l => { if (l.ref.startsWith('cat:') && l.amount > 0) { if (!(l.ref in merged)) { merged[l.ref] = 0; order.push(l.ref); } merged[l.ref] += l.amount; } else others.push(l); }); t.lines = order.map(ref => ({ ref, amount: merged[ref] })).concat(others); cnt++; } }); persist(); closeModal(); renderList(); renderAccounts(); renderReport(); renderDrill(); renderBudget(); toast(`${cnt}件を付け替えました ✓`); });
    showModal();
  }

  /* ============ 分析（収支＝俯瞰／費用・収入＝ドリル） ============ */
  function renderDrill() {
    if ($('#tab-drill').hidden) return;
    const ym = currentYM(); const kind = drill.kind; const body = $('#drillBody');
    const sel = $('#drillKind'); if (sel && sel.value !== kind) sel.value = kind;
    if (kind === 'net') { renderOverview(body, ym); }
    else { renderDrilldown(body, ym, kind); }
  }
  function gotoDrill(kind) { drill.kind = kind; drill.parts = []; drill.leaf = null; const sel = $('#drillKind'); if (sel) sel.value = kind; renderDrill(); }

  function renderOverview(body, ym) {
    const s = M.monthlySummary(state, ym);
    const txCount = state.transactions.filter(t => t.date.startsWith(ym)).length;
    const savings = s.income > 0 ? Math.round(s.net / s.income * 100) : 0;
    const cards = [['収入', s.income, 'pos'], ['支出', s.expense, 'neg'], ['収支', s.net, s.net >= 0 ? 'pos' : 'neg'], ['取引数', txCount, '']];
    const cardsHtml = `<div class="grid cols-4" style="margin-bottom:12px">` + cards.map(([k, v, c]) => `<div class="stat"><div class="k">${k}（${ym}）</div><div class="v ${c}">${k === '取引数' ? v + ' 件' : yen(v)}</div>${k === '収支' && s.income > 0 ? `<div class="sub">貯蓄率 ${savings}%</div>` : ''}</div>`).join('') + `</div>`;
    const mx = Math.max(1, s.income, s.expense);
    const barsHtml = `<div class="ov-bars"><div class="ov-bar inc"><div class="cap"><span>収入</span><span>${yen(s.income)}</span></div><div class="track"><span style="width:${s.income / mx * 100}%"></span></div></div><div class="ov-bar exp"><div class="cap"><span>支出</span><span>${yen(s.expense)}</span></div><div class="track"><span style="width:${s.expense / mx * 100}%"></span></div></div></div>`;
    // 費用 概況
    const eb = M.expenseByTopCategory(state, ym); const eEntries = Object.entries(eb).sort((a, b) => b[1] - a[1]); const eTotal = eEntries.reduce((a, e) => a + e[1], 0);
    const eDonut = drawDonut(eEntries.slice(0, 8), eTotal, true);
    const eList = eEntries.slice(0, 6).map((e, i) => `<div class="drill-row leaf"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[i % PALETTE.length]}"></span><span class="dn">${esc(e[0])}</span><span class="dpct">${M.pct(e[1], eTotal)}%</span><span class="dv">${yen(e[1])}</span></div>`).join('') || `<p class="muted">支出なし</p>`;
    // 収入 概況
    const ib = M.incomeByTopCategory(state, ym); const iEntries = Object.entries(ib).sort((a, b) => b[1] - a[1]); const iTotal = iEntries.reduce((a, e) => a + e[1], 0);
    const iList = iEntries.slice(0, 6).map((e, i) => `<div class="drill-row leaf"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[(i + 3) % PALETTE.length]}"></span><span class="dn">${esc(e[0])}</span><span class="dpct">${M.pct(e[1], iTotal)}%</span><span class="dv">${yen(e[1])}</span></div>`).join('') || `<p class="muted">収入なし</p>`;
    body.innerHTML = cardsHtml + barsHtml + `<div class="ov-cols">
      <div class="ov-col"><h4>費用の内訳 <span class="goto" data-goto="expense">費用を掘り下げる ›</span></h4><div class="chart-wrap" style="margin-bottom:8px">${eDonut.svg}<div style="flex:1;min-width:180px">${eList}</div></div></div>
      <div class="ov-col"><h4>収入の内訳 <span class="goto" data-goto="income">収入を掘り下げる ›</span></h4>${iList}</div>
    </div>`;
    $$('[data-goto]', body).forEach(b => b.addEventListener('click', () => gotoDrill(b.dataset.goto)));
  }

  function renderDrilldown(body, ym, kind) {
    body.innerHTML = `<div class="crumb" id="drillCrumb"></div><div class="chart-wrap" style="margin-bottom:16px"><div id="drillDonut"></div><div class="donut-legend" id="drillList" style="min-width:280px"></div></div><div id="drillDetail"></div>`;
    const crumbs = [`<span class="seg" data-depth="0">${kind === 'income' ? '収入' : '費用'} 全体</span>`]; drill.parts.forEach((p, i) => { crumbs.push(`<span class="sep">›</span>`); crumbs.push(`<span class="seg" data-depth="${i + 1}">${esc(p)}</span>`); }); $('#drillCrumb', body).innerHTML = crumbs.join(' '); $$('#drillCrumb .seg', body).forEach(s => s.addEventListener('click', () => { drill.parts = drill.parts.slice(0, +s.dataset.depth); drill.leaf = null; renderDrill(); }));
    const res = M.drillCategory(state, ym, kind, drill.parts); const entries = res.children.map(c => [c.segment, c.total]); $('#drillDonut', body).innerHTML = drawDonut(entries, res.total, true).svg; const max = Math.max(1, ...res.children.map(c => c.total));
    $('#drillList', body).innerHTML = res.children.length ? res.children.map((c, i) => { const bud = M.budgetForCategory(state, ym, kind, c.path); let budHtml = ''; if (bud) { const bp = Math.round(bud.ratio * 100); const bcls = bud.ratio >= 1 ? 'over' : (bud.ratio >= 0.8 ? 'warn' : ''); budHtml = `<div class="drill-bud"><span class="muted">予算 ${yen(bud.effective)} ・ ${bp}%</span><span class="bar ${bcls}"><span style="width:${Math.min(100, bp)}%"></span></span><span class="${bud.remain < 0 ? 'neg' : 'pos'}">残 ${yen(bud.remain)}</span></div>`; } return `<div class="drill-row ${c.hasChildren ? '' : 'leaf'}" data-seg="${esc(c.segment)}" data-leaf="${c.hasChildren ? 0 : 1}"><div style="flex:1"><div style="display:flex;align-items:center;gap:10px"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[i % PALETTE.length]}"></span><span class="dn">${esc(c.segment)}</span><span class="dbar"><span class="bar"><span style="width:${c.total / max * 100}%"></span></span></span><span class="dpct">${M.pct(c.total, res.total)}%</span><span class="dv">${yen(c.total)}</span><span class="dc">${c.count}件</span><span class="drill-arrow">${c.hasChildren ? '▶' : ''}</span></div>${budHtml}</div></div>`; }).join('') : `<p class="muted">この月の${kind === 'income' ? '収入' : '支出'}はありません。</p>`;
    $$('#drillList .drill-row', body).forEach(row => row.addEventListener('click', () => { const seg = row.dataset.seg; if (row.dataset.leaf === '0') { drill.parts = drill.parts.concat(seg); drill.leaf = null; } else drill.leaf = seg; renderDrill(); }));
    const detailParts = drill.leaf ? drill.parts.concat(drill.leaf) : drill.parts; const txs = M.transactionsForCategory(state, ym, kind, detailParts); const title = detailParts.length ? detailParts.join(' › ') : '全明細';
    $('#drillDetail', body).innerHTML = `<div class="section-title" style="margin-top:8px"><h3 style="margin:0">明細：${esc(title)}</h3><span class="pill">${txs.length}件 ・ 計 ${yen(txs.reduce((s, x) => s + x.amount, 0))}</span></div><div style="overflow:auto; max-height:40vh"><table><thead><tr><th>日付</th><th>カテゴリ</th><th>店名</th><th>メモ</th><th class="num">金額</th></tr></thead><tbody>${txs.map(x => `<tr><td>${x.date}</td><td>${esc(x.leaf)}</td><td>${esc(x.store)}${x.branch ? ' <span class="muted">/ ' + esc(x.branch) + '</span>' : ''}</td><td class="muted">${esc(x.memo)}</td><td class="num">${yen(x.amount)}</td></tr>`).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">明細なし</td></tr>`}</tbody></table></div>`;
  }

  /* ============ 残高・口座 ============ */

  function accountFlowRows(accId) {
    const rows = [];
    state.transactions.forEach(t => t.lines.forEach(l => {
      if (l.ref === 'acc:' + accId) rows.push({ date: t.date, id: t.id, kind: t.kind, store: t.store, branch: t.branch, memo: t.memo, amount: l.amount, qty: l.qty });
    }));
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return rows;
  }
  function openAccountDetailModal(id) {
    const a = accById(id); if (!a) return;
    const sub = M.ACCOUNT_SUBTYPES[a.subtype]; const rows = accountFlowRows(id); let running = a.opening || 0;
    const body = rows.map(r => { const delta = sub.kind === 'asset' ? r.amount : -r.amount; running += delta; return `<tr><td>${r.date}</td><td>${esc((KIND_TAG[r.kind] || KIND_TAG.generic)[1])}</td><td>${esc(r.store || '')}${r.branch ? ' <span class="muted">/ ' + esc(r.branch) + '</span>' : ''}</td><td class="num">${yen(delta)}</td><td class="num">${yen(running)}</td><td><button class="btn ghost sm" data-jumpedit="${r.id}">編集</button></td></tr>`; }).join('');
    const bal = M.accountBalance(state, id); const neg = sub.kind === 'asset' && bal < 0 ? `<p class="excel-issues">⚠ 資産口座の残高がマイナスです。期首残高・口座統合・支払元の誤りを確認してください。</p>` : '';
    $('#modal').innerHTML = `<h3>残高詳細：${esc(a.name)}</h3><div class="excel-mini"><span class="tag">種類 ${esc(sub.label)}</span><span class="tag">期首 ${yen(a.opening || 0)}</span><span class="tag">取引 ${rows.length}件</span><span class="tag">現在 ${yen(bal)}</span></div>${neg}<div class="excel-tablewrap"><table><thead><tr><th>日付</th><th>種別</th><th>店/メモ</th><th class="num">増減</th><th class="num">残高</th><th></th></tr></thead><tbody>${body || '<tr><td colspan="6" class="muted">この口座を使う取引はありません</td></tr>'}</tbody></table></div><div class="actions"><button class="btn ghost" id="ad_close">閉じる</button></div>`;
    $('#ad_close').addEventListener('click', closeModal);
    $$('[data-jumpedit]', $('#modal')).forEach(b => b.addEventListener('click', () => { const tid = b.dataset.jumpedit; closeModal(); loadForEdit(tid); }));
    showModal();
  }
  function replaceAccountIdIn(obj, fromId, toId) {
    if (!obj) return;
    if (Array.isArray(obj)) { obj.forEach(x => replaceAccountIdIn(x, fromId, toId)); return; }
    if (typeof obj === 'object') Object.keys(obj).forEach(k => { const v = obj[k]; if (v === fromId) obj[k] = toId; else if (v === 'acc:' + fromId) obj[k] = 'acc:' + toId; else replaceAccountIdIn(v, fromId, toId); });
  }
  function openAccountMergeModal() {
    if (state.accounts.length < 2) return toast('統合するには口座が2つ以上必要です');
    const opts = state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}（${M.ACCOUNT_SUBTYPES[a.subtype].label} / ${yen(M.accountBalance(state, a.id))}）</option>`).join('');
    $('#modal').innerHTML = `<h3>口座統合</h3><p class="hint">統合元口座を統合先口座へまとめます。過去取引・固定費・テンプレ・積立目標の参照も置換します。期首残高は統合先へ加算します。</p><div class="field"><label>統合元（消える口座）</label><select id="mg_from">${opts}</select></div><div class="field"><label>統合先（残す口座）</label><select id="mg_to">${opts}</select></div><div class="actions"><button class="btn ghost" id="mg_cancel">キャンセル</button><button class="btn danger" id="mg_ok">統合する</button></div>`;
    $('#mg_cancel').addEventListener('click', closeModal);
    $('#mg_ok').addEventListener('click', () => { const fromId = $('#mg_from').value, toId = $('#mg_to').value; if (fromId === toId) return toast('同じ口座には統合できません'); const from = accById(fromId), to = accById(toId); if (!from || !to) return; if (!confirm(`${from.name} を ${to.name} へ統合します。元には戻せません。よろしいですか？`)) return; to.opening = (to.opening || 0) + (from.opening || 0); replaceAccountIdIn(state.transactions, fromId, toId); replaceAccountIdIn(state.recurring, fromId, toId); replaceAccountIdIn(state.templates, fromId, toId); replaceAccountIdIn(state.goals, fromId, toId); state.accounts = state.accounts.filter(a => a.id !== fromId); persist(); closeModal(); refreshDatalists(); renderAll(); toast('口座を統合しました ✓'); });
    showModal();
  }

  function renderAccounts() {
    const assets = accountsBy(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'asset' && a.subtype !== 'transit'); const liabs = accountsBy(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'liability'); const maxAbs = Math.max(1, ...assets.map(a => Math.abs(M.accountBalance(state, a.id))));
    const accHtml = a => { const bal = M.accountBalance(state, a.id); const extra = a.subtype === 'voucher_goods' ? ` · 残${M.goodsQty(state, a.id)}枚` : ''; const w = Math.min(100, Math.abs(bal) / maxAbs * 100); return `<div class="acc-row"><div><div class="acc-name">${esc(a.name)}</div><div class="acc-sub">${M.ACCOUNT_SUBTYPES[a.subtype].label}${extra}</div><div class="bar"><span style="width:${w}%"></span></div></div><div class="num" style="font-weight:700">${yen(bal)}</div></div>`; };
    const totalAsset = assets.reduce((s, a) => s + M.accountBalance(state, a.id), 0); const totalLiab = liabs.reduce((s, a) => s + M.accountBalance(state, a.id), 0);
    $('#accList').innerHTML = `<div class="acc-sub" style="margin-bottom:4px">資産</div>` + assets.map(accHtml).join('') + (liabs.length ? `<div class="acc-sub" style="margin:10px 0 4px">負債</div>` + liabs.map(accHtml).join('') : ''); $('#netWorth').textContent = `純資産 ${yen(totalAsset - totalLiab)}`;
    $('#accManage').innerHTML = state.accounts.map(a => `<div class="acc-row"><div><div class="acc-name">${esc(a.name)} <span class="tag">${M.ACCOUNT_SUBTYPES[a.subtype].label}</span></div><div class="acc-sub">期首 ${yen(a.opening || 0)}${a.subtype === 'card' && a.card ? ' · 締め' + (a.card.closingDay === 99 ? '末' : a.card.closingDay + '日') + '／引落' + a.card.payDay + '日' : ''}</div></div><div class="row" style="gap:6px"><button class="btn ghost sm" data-accdetail="${a.id}">詳細</button><button class="btn ghost sm" data-edit="${a.id}">編集</button><button class="btn danger sm" data-delacc="${a.id}">削除</button></div></div>`).join('');
    $$('[data-edit]', $('#accManage')).forEach(b => b.addEventListener('click', () => openAccountModal(b.dataset.edit)));
    $$('[data-accdetail]', $('#accManage')).forEach(b => b.addEventListener('click', () => openAccountDetailModal(b.dataset.accdetail)));
    $$('[data-delacc]').forEach(b => b.addEventListener('click', () => { const used = state.transactions.some(t => t.lines.some(l => l.ref === 'acc:' + b.dataset.delacc)); if (used) return toast('この口座を使う取引があるため削除できません'); if (!confirm('口座を削除しますか？')) return; state.accounts = state.accounts.filter(a => a.id !== b.dataset.delacc); persist(); renderAccounts(); toast('削除しました'); }));
  }
  function openAccountModal(id) {
    const editing = id ? accById(id) : null; const a = editing || { name: '', subtype: 'cash', opening: 0 }; const subOpts = Object.entries(M.ACCOUNT_SUBTYPES).map(([k, v]) => `<option value="${k}" ${k === a.subtype ? 'selected' : ''}>${v.label}</option>`).join('');
    $('#modal').innerHTML = `<h3>${editing ? '口座を編集' : '口座を追加'}</h3><div class="field"><label>口座名</label><input id="m_name" value="${esc(a.name)}" placeholder="例: 楽天カード / WAON / コーヒーチケット"></div><div class="field"><label>種類</label><select id="m_sub">${subOpts}</select></div><div class="field"><label>期首残高</label><input type="number" id="m_open" value="${a.opening || 0}"></div><div id="m_extra"></div><div class="actions"><button class="btn ghost" id="m_cancel">キャンセル</button><button class="btn" id="m_save">保存</button></div>`;
    const renderExtra = () => { const sub = $('#m_sub').value, ex = $('#m_extra'); if (sub === 'card') ex.innerHTML = `<div class="row"><div class="field"><label>締め日</label><select id="m_close">${[['99', '末日'], ['15', '15日'], ['20', '20日'], ['25', '25日'], ['10', '10日'], ['5', '5日']].map(([v, l]) => `<option value="${v}" ${(a.card && String(a.card.closingDay) === v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label>引落日(毎月)</label><input type="number" id="m_payday" min="1" max="31" value="${a.card?.payDay || 27}"></div><div class="field"><label>引落は締めの</label><select id="m_after"><option value="1" ${(!a.card || a.card.payMonthsAfter !== 2) ? 'selected' : ''}>翌月</option><option value="2" ${(a.card && a.card.payMonthsAfter === 2) ? 'selected' : ''}>翌々月</option></select></div></div>`; else if (sub === 'voucher_goods') ex.innerHTML = `<div class="field"><label>期首の残枚数</label><input type="number" id="m_openqty" value="${a.goods?.openingQty || 0}"></div>`; else if (sub === 'transit') ex.innerHTML = `<p class="hint">簡易モード：チャージ時に全額費用化（残高管理なし）。</p>`; else ex.innerHTML = ''; attachHankakuAll(ex); };
    renderExtra(); $('#m_sub').addEventListener('change', renderExtra); $('#m_cancel').addEventListener('click', closeModal);
    $('#m_save').addEventListener('click', () => { const name = $('#m_name').value.trim(); if (!name) return toast('口座名を入力してください'); const sub = $('#m_sub').value; const obj = editing || { id: 'a_' + Math.random().toString(36).slice(2, 8) }; obj.name = name; obj.subtype = sub; obj.opening = +$('#m_open').value || 0; if (sub === 'card') obj.card = { closingDay: +$('#m_close').value, payDay: +$('#m_payday').value || 27, payMonthsAfter: +$('#m_after').value }; if (sub === 'voucher_goods') obj.goods = { openingQty: +($('#m_openqty')?.value || 0) }; if (!editing) state.accounts.push(obj); persist(); closeModal(); renderAccounts(); renderEntry(); toast('保存しました ✓'); });
    showModal();
  }

  /* ============ カード請求 ============ */
  function renderCards() {
    const host = $('#cardCycles'); if (!host) return; const cards = accountsBy(a => a.subtype === 'card'); if (!cards.length) { host.innerHTML = `<p class="muted">カード口座がありません。「残高・口座」から追加してください。</p>`; return; }
    let html = '';
    for (const card of cards) { const cycles = M.cardCycles(state, card.id); const dueTotal = cycles.filter(c => c.due && !c.settled).reduce((s, c) => s + c.outstanding, 0); html += `<div style="margin-bottom:14px"><div class="section-title" style="margin-bottom:8px"><h3 style="margin:0">${esc(card.name)} <span class="acc-sub">未払 合計 ${yen(M.accountBalance(state, card.id))}</span></h3>${dueTotal > 0 ? `<button class="btn sm" data-payall="${card.id}">期限到来分をまとめて消込 (${yen(dueTotal)})</button>` : ''}</div>`; if (!cycles.length) html += `<p class="muted">請求はありません。</p>`; cycles.slice().reverse().forEach(c => { const badge = c.settled ? `<span class="badge ok">消込済</span>` : (c.due ? `<span class="badge due">要支払</span>` : `<span class="badge plan">予定</span>`); html += `<div class="cycle-row ${c.settled ? 'settled' : (c.due ? 'due' : '')}"><div><div class="acc-name">${c.key} 締め${badge}</div><div class="acc-sub">引落 ${c.payDate} ・ 請求 ${yen(c.charge)}${c.paid ? ' ・ 支払済 ' + yen(c.paid) : ''}</div></div><div style="text-align:right"><div class="num" style="font-weight:700">${yen(c.outstanding)}</div>${!c.settled ? `<button class="btn ghost sm" data-pay="${card.id}|${c.key}|${c.payDate}|${c.outstanding}">消込</button>` : ''}</div></div>`; }); html += `</div>`; }
    host.innerHTML = html;
    $$('[data-pay]', host).forEach(b => b.addEventListener('click', () => { const [cardId, key, payDate, out] = b.dataset.pay.split('|'); payModalContent('カード引落の消込', cardId, key, payDate, +out, payDate, [{ accId: (accountsBy(a => a.subtype === 'bank')[0] || {}).id || '', amount: Math.round(+out) }], null); showModal(); }));
    $$('[data-payall]', host).forEach(b => b.addEventListener('click', () => payAllDue(b.dataset.payall)));
  }
  function payModalContent(title, cardId, cycleKey, payDate, outstanding, date, credits, editId) {
    ui._payCredits = credits.map(c => ({ ...c }));
    const draw = () => { const opts = sel => accountOptions(a => ['bank', 'cash', 'point', 'emoney'].includes(a.subtype), sel); const rows = ui._payCredits.map((c, i) => `<div class="credit-line" data-i="${i}"><div class="field" style="flex:2"><select class="pc_acc">${opts(c.accId)}</select></div><div class="field amt"><input type="number" class="pc_amt" value="${c.amount}"></div><button class="btn ghost sm pc_del">✕</button></div>`).join(''); const sum = ui._payCredits.reduce((s, c) => s + (+c.amount || 0), 0); const diff = outstanding - sum; const matched = Math.abs(diff) < 0.5;
      $('#modal').innerHTML = `<h3>${title}</h3><p class="hint">${esc(accName(cardId))} / ${cycleKey}締め ・ 請求残 <b>${yen(outstanding)}</b>。銀行＋ポイント等の複数充当が可能です。</p><div class="field"><label>引落日</label><input type="date" id="pay_date" value="${date}"></div><label>支払元（複数可）</label>${rows}<button class="btn ghost sm" id="pay_add">＋支払元を追加</button><div class="totline"><span>支払合計 <span class="muted" id="pay_diff"></span></span><span class="v" id="pay_sum">${yen(sum)}</span></div><div class="balance-warn" id="pay_warn"></div><div class="actions"><button class="btn ghost" id="pay_cancel">キャンセル</button>${matched ? '' : `<button class="btn ghost sm" id="pay_fill">残額を自動補充</button>`}<button class="btn" id="pay_ok" ${matched ? '' : 'disabled'}>${editId ? '更新' : '消込する'}</button></div>`;
      $('#pay_sum').style.color = matched ? 'var(--accent2)' : 'var(--warn)'; $('#pay_diff').innerHTML = matched ? '（一致）' : `（差 ${yen(diff)}）`; $('#pay_warn').textContent = matched ? '' : `⚠ 支払合計が請求残 ${yen(outstanding)} と一致していません。一致させると消込できます（分割払いは未対応）。`;
      $$('#modal .credit-line').forEach(line => { const i = +line.dataset.i; line.querySelector('.pc_acc').addEventListener('change', e => ui._payCredits[i].accId = e.target.value); line.querySelector('.pc_amt').addEventListener('input', e => { ui._payCredits[i].amount = +e.target.value; draw(); }); line.querySelector('.pc_del').addEventListener('click', () => { ui._payCredits.splice(i, 1); if (!ui._payCredits.length) ui._payCredits.push({ accId: '', amount: 0 }); draw(); }); });
      $('#pay_add').addEventListener('click', () => { const rest = outstanding - ui._payCredits.reduce((s, c) => s + (+c.amount || 0), 0); ui._payCredits.push({ accId: (accountsBy(a => a.subtype === 'point')[0] || {}).id || '', amount: Math.max(0, Math.round(rest)) }); draw(); });
      const pf = $('#pay_fill'); if (pf) pf.addEventListener('click', () => { const rest = outstanding - ui._payCredits.reduce((s, c) => s + (+c.amount || 0), 0); if (ui._payCredits.length) ui._payCredits[ui._payCredits.length - 1].amount = (+ui._payCredits[ui._payCredits.length - 1].amount || 0) + Math.round(rest); else ui._payCredits.push({ accId: (accountsBy(a => a.subtype === 'bank')[0] || {}).id || '', amount: Math.round(rest) }); draw(); });
      $('#pay_cancel').addEventListener('click', closeModal);
      $('#pay_ok').addEventListener('click', () => { const creds = ui._payCredits.map(c => ({ accId: c.accId, amount: +c.amount })).filter(c => c.accId && c.amount); if (!creds.length) return toast('支払元を入力してください'); const cs = creds.reduce((s, c) => s + c.amount, 0); if (Math.abs(cs - outstanding) > 0.5) return toast('支払合計が請求残と一致していません'); const t = M.buildCardPayment({ id: editId, date: $('#pay_date').value, cardAccId: cardId, credits: creds, cycleKey, payDate: $('#pay_date').value }); if (editId) { const idx = state.transactions.findIndex(x => x.id === editId); if (idx >= 0) state.transactions[idx] = t; toast('更新しました ✓'); } else { state.transactions.push(t); toast('消込しました ✓'); } persist(); closeModal(); renderCards(); renderAccounts(); renderList(); renderDrill(); });
    };
    draw();
  }
  function payAllDue(cardId) { const bank = accountsBy(a => a.subtype === 'bank')[0] || accountsBy(a => a.subtype === 'cash')[0]; if (!bank) return toast('引落元の銀行/現金口座がありません'); const due = M.cardCycles(state, cardId).filter(c => c.due && !c.settled); if (!due.length) return toast('期限到来分はありません'); if (!confirm(`${due.length}件の請求を ${bank.name} からまとめて消込します。よろしいですか？`)) return; due.forEach(c => state.transactions.push(M.buildCardPayment({ date: c.payDate, cardAccId: cardId, credits: [{ accId: bank.id, amount: c.outstanding }], cycleKey: c.key, payDate: c.payDate }))); persist(); renderCards(); renderAccounts(); renderList(); toast(`${due.length}件を消込しました ✓`); }

  /* ============ レポート ============ */

  /* ============ 分析 v1.6.2：期間選択 ============ */
  function analysisPeriod() {
    const base = currentYM();
    const mode = ($('#drillRange') ? $('#drillRange').value : 'month') || 'month';
    const prevYM = M.trailingMonths(base, 2)[0];
    const lastDay = ym => { const [y,m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
    const make = (label, fromYM, toYM) => ({ label, fromYM, toYM, includes: d => (!fromYM || d.slice(0,7) >= fromYM) && (!toYM || d.slice(0,7) <= toYM), isSingleMonth: fromYM && toYM && fromYM === toYM, ym: fromYM === toYM ? fromYM : null });
    if (mode === 'prev') return make('前月 ' + prevYM, prevYM, prevYM);
    if (mode === 'last3') { const f = M.trailingMonths(base, 3)[0]; return make(`直近3か月 ${f}〜${base}`, f, base); }
    if (mode === 'last6') { const f = M.trailingMonths(base, 6)[0]; return make(`直近6か月 ${f}〜${base}`, f, base); }
    if (mode === 'last12') { const f = M.trailingMonths(base, 12)[0]; return make(`直近12か月 ${f}〜${base}`, f, base); }
    if (mode === 'all') return make('全期間', null, null);
    if (mode === 'custom') { const f = ($('#drillFrom')?.value || base), t = ($('#drillTo')?.value || base); return make(`任意 ${f}〜${t}`, f <= t ? f : t, f <= t ? t : f); }
    return make('表示月 ' + base, base, base);
  }
  function periodTxs(p) { return state.transactions.filter(t => p.includes(t.date)); }
  function periodSummary(p) { let income = 0, expense = 0; for (const t of periodTxs(p)) for (const ln of t.lines) { if (!ln.ref.startsWith('cat:')) continue; if (M.catKindOf(ln.ref) === 'income') income += -ln.amount; else expense += ln.amount; } return { income, expense, net: income - expense }; }
  function periodTop(kind, p) { const map = {}; const pfx = kind === 'income' ? 'cat:inc>' : 'cat:exp>'; for (const t of periodTxs(p)) for (const ln of t.lines) { if (!ln.ref.startsWith(pfx)) continue; const val = kind === 'income' ? -ln.amount : ln.amount; if (val <= 0) continue; const top = ln.ref.slice(pfx.length).split('>')[0]; map[top] = (map[top] || 0) + val; } return map; }
  function drillCategoryPeriod(kind, parts, p) { const pfx = kind === 'income' ? 'cat:inc>' : 'cat:exp>'; parts = parts || []; const depth = parts.length; const children = {}; let total = 0; for (const t of periodTxs(p)) for (const ln of t.lines) { if (!ln.ref.startsWith(pfx)) continue; const val = kind === 'income' ? -ln.amount : ln.amount; if (val <= 0) continue; const segs = ln.ref.slice(pfx.length).split('>'); let ok = true; for (let i = 0; i < depth; i++) if (segs[i] !== parts[i]) { ok = false; break; } if (!ok) continue; total += val; const seg = segs[depth] != null ? segs[depth] : '(なし)'; const c = children[seg] || (children[seg] = { total:0, count:0, deeper:false }); c.total += val; c.count += 1; if (segs.length > depth + 1) c.deeper = true; } return { children: Object.entries(children).map(([segment,c]) => ({ segment, path: parts.concat(segment), total: c.total, count: c.count, hasChildren: c.deeper })).sort((a,b)=>b.total-a.total), total, path: parts }; }
  function transactionsForCategoryPeriod(kind, parts, p) { const pfx = kind === 'income' ? 'cat:inc>' : 'cat:exp>'; const out = []; for (const t of periodTxs(p)) for (const ln of t.lines) { if (!ln.ref.startsWith(pfx)) continue; const val = kind === 'income' ? -ln.amount : ln.amount; if (val <= 0) continue; const segs = ln.ref.slice(pfx.length).split('>'); let ok = true; for (let i = 0; i < parts.length; i++) if (segs[i] !== parts[i]) { ok = false; break; } if (!ok) continue; out.push({ date: t.date, store: t.store, branch: t.branch, memo: t.memo, amount: val, leaf: segs.join(' › '), txId: t.id }); } return out.sort((a,b)=>b.date.localeCompare(a.date)); }
  function renderDrill() {
    if ($('#tab-drill').hidden) return;
    const p = analysisPeriod(); const kind = drill.kind; const body = $('#drillBody');
    const sel = $('#drillKind'); if (sel && sel.value !== kind) sel.value = kind;
    const custom = $('#drillCustom'); if (custom) custom.style.display = ($('#drillRange')?.value === 'custom') ? '' : 'none';
    if (kind === 'net') renderOverview(body, p); else renderDrilldown(body, p, kind);
  }
  function renderOverview(body, p) {
    const s = periodSummary(p); const txCount = periodTxs(p).length; const savings = s.income > 0 ? Math.round(s.net / s.income * 100) : 0;
    const cards = [['収入', s.income, 'pos'], ['支出', s.expense, 'neg'], ['収支', s.net, s.net >= 0 ? 'pos' : 'neg'], ['取引数', txCount, '']];
    const cardsHtml = `<div class="acc-sub" style="margin-bottom:8px">対象期間：${esc(p.label)}</div><div class="grid cols-4" style="margin-bottom:12px">` + cards.map(([k,v,c]) => `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${k === '取引数' ? v + ' 件' : yen(v)}</div>${k === '収支' && s.income > 0 ? `<div class="sub">貯蓄率 ${savings}%</div>` : ''}</div>`).join('') + `</div>`;
    const mx = Math.max(1, s.income, s.expense); const barsHtml = `<div class="ov-bars"><div class="ov-bar inc"><div class="cap"><span>収入</span><span>${yen(s.income)}</span></div><div class="track"><span style="width:${s.income / mx * 100}%"></span></div></div><div class="ov-bar exp"><div class="cap"><span>支出</span><span>${yen(s.expense)}</span></div><div class="track"><span style="width:${s.expense / mx * 100}%"></span></div></div></div>`;
    const eb = periodTop('expense', p); const eEntries = Object.entries(eb).sort((a,b)=>b[1]-a[1]); const eTotal = eEntries.reduce((a,e)=>a+e[1],0); const eDonut = drawDonut(eEntries.slice(0,8), eTotal, true); const eList = eEntries.slice(0,6).map((e,i)=>`<div class="drill-row leaf"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[i % PALETTE.length]}"></span><span class="dn">${esc(e[0])}</span><span class="dpct">${M.pct(e[1], eTotal)}%</span><span class="dv">${yen(e[1])}</span></div>`).join('') || `<p class="muted">支出なし</p>`;
    const ib = periodTop('income', p); const iEntries = Object.entries(ib).sort((a,b)=>b[1]-a[1]); const iTotal = iEntries.reduce((a,e)=>a+e[1],0); const iList = iEntries.slice(0,6).map((e,i)=>`<div class="drill-row leaf"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[(i + 3) % PALETTE.length]}"></span><span class="dn">${esc(e[0])}</span><span class="dpct">${M.pct(e[1], iTotal)}%</span><span class="dv">${yen(e[1])}</span></div>`).join('') || `<p class="muted">収入なし</p>`;
    body.innerHTML = cardsHtml + barsHtml + `<div class="ov-cols"><div class="ov-col"><h4>費用の内訳 <span class="goto" data-goto="expense">費用を掘り下げる ›</span></h4><div class="chart-wrap" style="margin-bottom:8px">${eDonut.svg}<div style="flex:1;min-width:180px">${eList}</div></div></div><div class="ov-col"><h4>収入の内訳 <span class="goto" data-goto="income">収入を掘り下げる ›</span></h4>${iList}</div></div>`;
    $$('[data-goto]', body).forEach(b => b.addEventListener('click', () => gotoDrill(b.dataset.goto)));
  }
  function renderDrilldown(body, p, kind) {
    body.innerHTML = `<div class="acc-sub" style="margin-bottom:8px">対象期間：${esc(p.label)}</div><div class="crumb" id="drillCrumb"></div><div class="chart-wrap" style="margin-bottom:16px"><div id="drillDonut"></div><div class="donut-legend" id="drillList" style="min-width:280px"></div></div><div id="drillDetail"></div>`;
    const crumbs = [`<span class="seg" data-depth="0">${kind === 'income' ? '収入' : '費用'} 全体</span>`]; drill.parts.forEach((part,i)=>{ crumbs.push(`<span class="sep">›</span><span class="seg" data-depth="${i+1}">${esc(part)}</span>`); }); $('#drillCrumb', body).innerHTML = crumbs.join(' '); $$('#drillCrumb .seg', body).forEach(seg => seg.addEventListener('click', () => { drill.parts = drill.parts.slice(0, +seg.dataset.depth); drill.leaf = null; renderDrill(); }));
    const res = drillCategoryPeriod(kind, drill.parts, p); const entries = res.children.map(c => [c.segment, c.total]); $('#drillDonut', body).innerHTML = drawDonut(entries, res.total, true).svg; const max = Math.max(1, ...res.children.map(c => c.total));
    $('#drillList', body).innerHTML = res.children.length ? res.children.map((c,i)=>`<div class="drill-row ${c.hasChildren ? '' : 'leaf'}" data-seg="${esc(c.segment)}" data-leaf="${c.hasChildren ? 0 : 1}"><div style="flex:1"><div style="display:flex;align-items:center;gap:10px"><span class="sw" style="width:12px;height:12px;border-radius:3px;background:${PALETTE[i % PALETTE.length]}"></span><span class="dn">${esc(c.segment)}</span><span class="dbar"><span class="bar"><span style="width:${c.total / max * 100}%"></span></span></span><span class="dpct">${M.pct(c.total, res.total)}%</span><span class="dv">${yen(c.total)}</span><span class="dc">${c.count}件</span><span class="drill-arrow">${c.hasChildren ? '▶' : ''}</span></div></div></div>`).join('') : `<p class="muted">この期間の${kind === 'income' ? '収入' : '支出'}はありません。</p>`;
    $$('#drillList .drill-row', body).forEach(row => row.addEventListener('click', () => { const seg = row.dataset.seg; if (row.dataset.leaf === '0') { drill.parts = drill.parts.concat(seg); drill.leaf = null; } else drill.leaf = seg; renderDrill(); }));
    const detailParts = drill.leaf ? drill.parts.concat(drill.leaf) : drill.parts; const txs = transactionsForCategoryPeriod(kind, detailParts, p); const title = detailParts.length ? detailParts.join(' › ') : '全明細';
    $('#drillDetail', body).innerHTML = `<div class="section-title" style="margin-top:8px"><h3 style="margin:0">明細：${esc(title)}</h3><span class="pill">${txs.length}件 ・ 計 ${yen(txs.reduce((sum,x)=>sum+x.amount,0))}</span></div><div style="overflow:auto; max-height:40vh"><table><thead><tr><th>日付</th><th>カテゴリ</th><th>店名</th><th>メモ</th><th class="num">金額</th></tr></thead><tbody>${txs.map(x=>`<tr><td>${x.date}</td><td>${esc(x.leaf)}</td><td>${esc(x.store)}${x.branch ? ' <span class="muted">/ ' + esc(x.branch) + '</span>' : ''}</td><td class="muted">${esc(x.memo)}</td><td class="num">${yen(x.amount)}</td></tr>`).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">明細なし</td></tr>`}</tbody></table></div>`;
  }

  function renderReport() { const ym = currentYM(); const s = M.monthlySummary(state, ym); const savings = s.income > 0 ? Math.round(s.net / s.income * 100) : 0; const cards = [['収入', yen(s.income), 'pos'], ['支出', yen(s.expense), 'neg'], ['収支', yen(s.net), s.net >= 0 ? 'pos' : 'neg'], ['貯蓄率', savings + ' %', savings >= 0 ? 'pos' : 'neg']]; $('#reportCards').innerHTML = cards.map(([k, v, c]) => `<div class="stat"><div class="k">${k}（${ym}）</div><div class="v ${c}">${v}</div></div>`).join(''); const months = M.trailingMonths(ym, 6).map(m => ({ ym: m, ...M.monthlySummary(state, m) })); $('#trendChart').innerHTML = drawTrend(months); const bd = M.expenseByTopCategory(state, ym); const entries = Object.entries(bd).sort((a, b) => b[1] - a[1]); const dc = drawDonut(entries, entries.reduce((s, e) => s + e[1], 0), true); $('#donutChart').innerHTML = dc.svg; $('#donutLegend').innerHTML = dc.legend || `<p class="muted">この月の支出はありません。</p>`; }
  function drawTrend(months) { const W = 640, H = 220, pad = 34, bw = 14, gap = 6; const max = Math.max(1, ...months.map(m => Math.max(m.income, m.expense))); const innerH = H - pad - 20, step = (W - pad) / months.length; let bars = '', axis = '', grid = ''; for (let g = 0; g <= 2; g++) { const y = H - 20 - (innerH * g / 2); grid += `<line x1="${pad}" y1="${y}" x2="${W}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 3"/><text class="trend-v" x="2" y="${y + 3}">${yen(max * g / 2)}</text>`; } months.forEach((m, i) => { const x = pad + i * step + step / 2; const ih = m.income / max * innerH, eh = m.expense / max * innerH; bars += `<rect class="bar-inc" x="${x - bw - gap / 2}" y="${H - 20 - ih}" width="${bw}" height="${ih}" rx="2"><title>${m.ym} 収入 ${yen(m.income)}</title></rect><rect class="bar-exp" x="${x + gap / 2}" y="${H - 20 - eh}" width="${bw}" height="${eh}" rx="2"><title>${m.ym} 支出 ${yen(m.expense)}</title></rect>`; axis += `<text class="trend-x" x="${x}" y="${H - 6}" text-anchor="middle">${m.ym.slice(5)}月</text>`; }); return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${grid}${bars}${axis}<g transform="translate(${pad},14)"><rect class="bar-inc" width="10" height="10" rx="2"/><text class="trend-x" x="16" y="9">収入</text><rect class="bar-exp" x="58" width="10" height="10" rx="2"/><text class="trend-x" x="74" y="9">支出</text></g></svg>`; }
  function drawDonut(entries, total, showPct) { if (!entries.length || !total) return { svg: `<svg viewBox="0 0 180 180" width="180" height="180"><circle cx="90" cy="90" r="60" fill="none" stroke="var(--line)" stroke-width="24"/></svg>`, legend: '' }; const r = 60, cx = 90, cy = 90, C = 2 * Math.PI * r; let off = 0, circles = '', labels = '', legend = ''; entries.forEach((e, i) => { const frac = e[1] / total, len = frac * C, col = PALETTE[i % PALETTE.length]; const p = Math.round(frac * 100); circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="24" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(e[0])} ${yen(e[1])} (${p}%)</title></circle>`; if (showPct && p >= 8) { const mid = off + len / 2; const ang = (mid / C) * 2 * Math.PI - Math.PI / 2; const lx = cx + Math.cos(ang) * r, ly = cy + Math.sin(ang) * r; labels += `<text class="donut-pct" x="${lx}" y="${ly + 3}" text-anchor="middle">${p}%</text>`; } off += len; legend += `<div class="li"><span class="sw" style="background:${col}"></span><span class="nm">${esc(e[0])}</span><span class="vl">${yen(e[1])} ・ ${p}%</span></div>`; }); return { svg: `<svg viewBox="0 0 180 180" width="180" height="180">${circles}${labels}<text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="11">合計</text><text x="90" y="104" text-anchor="middle" fill="var(--text)" font-size="15" font-weight="700">${yen(total)}</text></svg>`, legend }; }

  /* ============ 設定：固定費 ============ */
  const INTERVAL_LABEL = { 1: '毎月', 2: '隔月', 3: '3か月ごと', 6: '半年ごと', 12: '年1回' };
  const BIZ_LABEL = { none: 'そのまま', next: '翌営業日', prev: '前営業日' };
  function renderRecList() { const host = $('#recList'); if (!host) return; if (!state.recurring.length) { host.innerHTML = `<p class="muted">まだテンプレがありません。</p>`; return; } host.innerHTML = state.recurring.map(r => { const iv = r.intervalMonths || 1; const ivl = INTERVAL_LABEL[iv] || (iv + 'か月ごと'); const biz = (r.bizAdjust && r.bizAdjust !== 'none') ? '・土日祝→' + BIZ_LABEL[r.bizAdjust] : ''; return `<div class="rec-row"><div class="rn"><div class="acc-name">${esc(r.name)} ${r.active === false ? '<span class="tag">停止中</span>' : ''} ${iv > 1 ? '<span class="tag">' + ivl + '</span>' : ''} ${r.bizAdjust && r.bizAdjust !== 'none' ? '<span class="tag">' + BIZ_LABEL[r.bizAdjust] + '</span>' : ''}</div><div class="acc-sub">${r.builder === 'income' ? '定期収入' : '固定費'} ・ 毎月${r.dayOfMonth}日 ・ ${ivl}${iv > 1 && r.anchorYM ? '(基準' + r.anchorYM + ')' : ''}${biz} ・ ${r.params.catPath.replace(/^exp>|^inc>/, '').split('>').join(' › ')} ・ ${accName(r.params.accId)}${r.lastApplied ? ' ・ 最終 ' + r.lastApplied : ''}</div></div><div class="rec-amt">${yen(r.params.amount)}</div><div class="row" style="gap:6px"><button class="btn ghost sm" data-recedit="${r.id}">編集</button><button class="btn danger sm" data-recdel="${r.id}">削除</button></div></div>`; }).join(''); $$('[data-recedit]', host).forEach(b => b.addEventListener('click', () => openRecModal(b.dataset.recedit))); $$('[data-recdel]', host).forEach(b => b.addEventListener('click', () => { if (!confirm('テンプレを削除しますか？')) return; state.recurring = state.recurring.filter(r => r.id !== b.dataset.recdel); persist(); renderRecList(); updateGlobalNotice(); })); }
  function openRecModal(id) {
    const editing = id ? state.recurring.find(r => r.id === id) : null; const r = editing || { id: 'r_' + Math.random().toString(36).slice(2, 8), name: '', dayOfMonth: 1, active: true, lastApplied: null, intervalMonths: 1, anchorYM: null, bizAdjust: 'none', builder: 'expense', params: { catPath: 'exp>住居>家賃', amount: 0, accId: (accountsBy(a => a.subtype === 'bank')[0] || {}).id || '' } };
    const draw = () => { const kind = r.builder === 'income' ? 'income' : 'expense'; const iv = r.intervalMonths || 1;
      $('#modal').innerHTML = `<h3>${editing ? 'テンプレを編集' : 'テンプレを追加'}</h3><div class="row"><div class="field" style="flex:2"><label>名称</label><input id="rc_name" value="${esc(r.name)}" placeholder="例: 家賃 / Netflix / 給与 / 水道代"></div><div class="field"><label>種別</label><select id="rc_builder"><option value="expense" ${r.builder !== 'income' ? 'selected' : ''}>固定費</option><option value="income" ${r.builder === 'income' ? 'selected' : ''}>定期収入</option></select></div></div><div class="row"><div class="field"><label>毎月の日</label><input type="number" id="rc_day" min="1" max="31" value="${r.dayOfMonth}"></div><div class="field"><label>金額（基準）</label><input type="number" id="rc_amt" value="${r.params.amount}"></div><div class="field"><label>周期</label><select id="rc_iv">${Object.entries(INTERVAL_LABEL).map(([v, l]) => `<option value="${v}" ${iv == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div><div class="row"><div class="field" id="rc_anchorWrap" ${iv > 1 ? '' : 'style="display:none"'}><label>基準月</label><input type="month" id="rc_anchor" value="${r.anchorYM || M.curYM()}"></div><div class="field"><label>土日祝の場合</label><select id="rc_biz">${Object.entries(BIZ_LABEL).map(([v, l]) => `<option value="${v}" ${(r.bizAdjust || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div><div class="field"><label>カテゴリ</label><select id="rc_cat" class="catsel">${categoryOptions(kind, r.params.catPath)}</select></div><div class="field"><label>${r.builder === 'income' ? '入金先口座' : '支払元口座'}</label><select id="rc_acc">${accountOptions(a => r.builder === 'income' ? (M.ACCOUNT_SUBTYPES[a.subtype].kind === 'asset') : true, r.params.accId)}</select></div><div class="field"><label><input type="checkbox" id="rc_active" ${r.active !== false ? 'checked' : ''} style="width:auto"> 有効</label></div><div class="actions"><button class="btn ghost" id="rc_cancel">キャンセル</button><button class="btn" id="rc_save">保存</button></div>`;
      $('#rc_builder').addEventListener('change', e => { r.builder = e.target.value; r.params.catPath = e.target.value === 'income' ? 'inc>給与' : 'exp>住居>家賃'; r.params.accId = $('#rc_acc').value; draw(); }); $('#rc_iv').addEventListener('change', e => { r.intervalMonths = +e.target.value; $('#rc_anchorWrap').style.display = (+e.target.value > 1) ? '' : 'none'; }); $('#rc_cancel').addEventListener('click', closeModal); decorateInputs($('#modal'));
      $('#rc_save').addEventListener('click', () => { const name = $('#rc_name').value.trim(); if (!name) return toast('名称を入力してください'); const obj = editing || r; obj.name = name; obj.builder = $('#rc_builder').value; obj.dayOfMonth = +$('#rc_day').value || 1; obj.intervalMonths = +$('#rc_iv').value; obj.anchorYM = obj.intervalMonths > 1 ? ($('#rc_anchor').value || M.curYM()) : null; obj.bizAdjust = $('#rc_biz').value; obj.active = $('#rc_active').checked; obj.params = { catPath: $('#rc_cat').value, amount: +$('#rc_amt').value || 0, accId: $('#rc_acc').value }; if (!editing) state.recurring.push(obj); persist(); closeModal(); renderRecList(); updateGlobalNotice(); toast('保存しました ✓'); });
    };
    draw(); showModal();
  }
  function updateGlobalNotice() { const host = $('#globalNotice'); if (!host) return; const pend = M.pendingRecurring(state, currentYM()); if (!pend.length) { host.innerHTML = ''; return; } host.innerHTML = `<div class="notice"><span>📌 未登録の固定費・定期収入が <b>${pend.length}件</b> あります（${currentYM()}まで）。</span><button class="btn sm" id="openApply">まとめて登録</button></div>`; $('#openApply').addEventListener('click', () => openApplyModal(pend)); }
  function openApplyModal(pend) {
    $('#modal').innerHTML = `<h3>固定費・定期収入の登録</h3><p class="hint">登録する項目にチェック。金額・日付はその都度調整できます（既定日付は営業日調整済み）。</p><div id="applyRows">${pend.map((p, i) => `<div class="apply-row" data-i="${i}"><input type="checkbox" class="ap_on" checked><span class="an">${esc(p.rec.name)} <span class="acc-sub">${p.ym} ・ ${p.rec.builder === 'income' ? '収入' : '費用'}</span></span><input type="date" class="ap_date" value="${p.date}"><input type="number" class="ap_amt" value="${p.rec.params.amount}"></div>`).join('')}</div><div class="actions"><button class="btn ghost" id="ap_cancel">キャンセル</button><button class="btn" id="ap_ok">登録する</button></div>`;
    $('#ap_cancel').addEventListener('click', closeModal);
    $('#ap_ok').addEventListener('click', () => { const applied = {}; $$('#applyRows .apply-row').forEach(row => { const i = +row.dataset.i; if (!row.querySelector('.ap_on').checked) return; const amt = +row.querySelector('.ap_amt').value; const date = row.querySelector('.ap_date').value; const p = pend[i]; state.transactions.push(M.buildFromRecurring(p.rec, p.ym, amt, date)); if (!applied[p.rec.id] || applied[p.rec.id] < p.ym) applied[p.rec.id] = p.ym; }); Object.entries(applied).forEach(([rid, ym]) => { const r = state.recurring.find(x => x.id === rid); if (r && (!r.lastApplied || r.lastApplied < ym)) r.lastApplied = ym; }); persist(); closeModal(); refreshDatalists(); renderAll(); updateGlobalNotice(); toast('固定費を登録しました ✓'); });
    showModal();
  }
  let settingsSection = 'rec';
  function renderSettingsTabs() { const host = $('#settingsSubtabs'); if (!host) return; $$('#settingsSubtabs button').forEach(b => b.classList.toggle('active', b.dataset.setting === settingsSection)); $$('[data-setting-panel]', $('#tab-settings')).forEach(p => p.hidden = p.dataset.settingPanel !== settingsSection); }
  function renderThemeSettings() { const preset = $('#themePreset'), accent = $('#themeAccent'), preview = $('#themePreview'); if (!preset || !accent) return; const t = loadTheme(); preset.value = t.preset || 'midnight'; accent.value = t.accent || '#4f9dff'; const redraw = () => { const nt = { preset: preset.value, accent: accent.value }; saveTheme(nt); applyTheme(nt); if (preview) preview.innerHTML = `<div class="stat"><div class="k">Preview</div><div class="v pos">${THEME_PRESETS[preset.value]?.label || preset.value}</div><div class="sub">Accent ${accent.value}</div></div><button class="btn sm">ボタン</button><span class="tag">タグ</span>`; }; preset.oninput = redraw; accent.oninput = redraw; const reset = $('#themeReset'); if (reset) reset.onclick = () => { saveTheme({ preset: 'midnight', accent: '#4f9dff' }); applyTheme(); renderThemeSettings(); }; redraw(); }
  function renderSettings() { renderSettingsTabs(); renderThemeSettings(); renderCatTree(); renderRecList(); renderTplList(); renderReadings(); $('#dl-top').innerHTML = Object.keys(state.categories.expense).map(s => `<option value="${esc(s)}">`).join(''); }
  function renderCatTree() { const kind = $('#catKind').value, root = state.categories[kind]; let html = ''; for (const top of Object.keys(root)) { html += `<div style="margin-bottom:6px"><b>${esc(top)}</b> `; const parts = []; for (const mid of Object.keys(root[top] || {})) { const leaves = root[top][mid] || []; parts.push(`<span class="tag">${esc(mid)}${leaves.length ? '：' + leaves.map(esc).join('・') : ''}</span>`); } html += parts.join(' ') + `</div>`; } $('#catTree').innerHTML = html || '<p class="muted">カテゴリなし</p>'; }

  function categoryPaths(kind){const out=[];const root=state.categories[kind];const pfx=kind==='income'?'inc':'exp';Object.keys(root).forEach(top=>{out.push({path:pfx+'>'+top,label:top});const mids=root[top]||{};Object.keys(mids).forEach(mid=>{out.push({path:pfx+'>'+top+'>'+mid,label:top+' › '+mid});(mids[mid]||[]).forEach(leaf=>out.push({path:pfx+'>'+top+'>'+mid+'>'+leaf,label:top+' › '+mid+' › '+leaf}));});});return out;}
  function catIsUsed(path){const full='cat:'+path,pref=full+'>';if(state.transactions.some(t=>t.lines.some(l=>l.ref===full||l.ref.startsWith(pref))))return true;if(Object.keys(state.budgets||{}).some(k=>k===path||k.startsWith(path+'>')))return true;if((state.recurring||[]).some(r=>r.params&&r.params.catPath&&(r.params.catPath===path||r.params.catPath.startsWith(path+'>'))))return true;if((state.templates||[]).some(t=>(t.items||[]).some(it=>it.catPath&&(it.catPath===path||it.catPath.startsWith(path+'>')))))return true;return false;}
  function replaceCatRefs(oldPath,newPath){const oldRef='cat:'+oldPath,newRef='cat:'+newPath;state.transactions.forEach(t=>t.lines.forEach(l=>{if(l.ref===oldRef||l.ref.startsWith(oldRef+'>'))l.ref=newRef+l.ref.slice(oldRef.length);}));const nb={};Object.entries(state.budgets||{}).forEach(([k,v])=>{nb[(k===oldPath||k.startsWith(oldPath+'>'))?newPath+k.slice(oldPath.length):k]=v;});state.budgets=nb;(state.recurring||[]).forEach(r=>{if(r.params&&r.params.catPath&&(r.params.catPath===oldPath||r.params.catPath.startsWith(oldPath+'>')))r.params.catPath=newPath+r.params.catPath.slice(oldPath.length);});(state.templates||[]).forEach(t=>(t.items||[]).forEach(it=>{if(it.catPath&&(it.catPath===oldPath||it.catPath.startsWith(oldPath+'>')))it.catPath=newPath+it.catPath.slice(oldPath.length);}));}
  function renameCategoryDef(oldPath,newName){const parts=oldPath.split('>');const kind=parts[0]==='inc'?'income':'expense';const root=state.categories[kind];const np=parts.slice();np[np.length-1]=newName;const newPath=np.join('>');if(oldPath===newPath)return;if(kind==='income'){root[newName]=root[parts[1]]||{};delete root[parts[1]];}else{const top=parts[1],mid=parts[2],leaf=parts[3];if(parts.length===2){root[newName]=root[top]||{};delete root[top];}else if(parts.length===3){root[top][newName]=root[top][mid]||[];delete root[top][mid];}else{const arr=root[top][mid]||[];const i=arr.indexOf(leaf);if(i>=0)arr[i]=newName;}}replaceCatRefs(oldPath,newPath);persist();refreshDatalists();renderAll();toast('カテゴリ名を変更しました ✓');}
  function deleteUnusedCategory(path){if(catIsUsed(path))return toast('使用中のカテゴリは削除できません');const parts=path.split('>');const kind=parts[0]==='inc'?'income':'expense';const root=state.categories[kind];if(kind==='income')delete root[parts[1]];else{const top=parts[1],mid=parts[2],leaf=parts[3];if(parts.length===2)delete root[top];else if(parts.length===3)delete root[top][mid];else{const arr=root[top][mid]||[];const i=arr.indexOf(leaf);if(i>=0)arr.splice(i,1);}}persist();renderCatTree();renderEntry();toast('未使用カテゴリを削除しました ✓');}
  function openCategoryRenameModal(){const kind=$('#catKind').value;const opts=categoryPaths(kind).map(c=>`<option value="${c.path}">${esc(c.label)}</option>`).join('');$('#modal').innerHTML=`<h3>カテゴリ名変更</h3><p class="hint">カテゴリ定義そのものの名前を変更します。既存取引・予算・固定費・テンプレも追従します。</p><div class="field"><label>対象カテゴリ</label><select id="cr_path">${opts}</select></div><div class="field"><label>新しい名前（この階層名のみ）</label><input id="cr_name"></div><div class="actions"><button class="btn ghost" id="cr_cancel">キャンセル</button><button class="btn" id="cr_ok">変更</button></div>`;const fill=()=>{$('#cr_name').value=$('#cr_path').value.split('>').pop();};$('#cr_path').addEventListener('change',fill);fill();$('#cr_cancel').addEventListener('click',closeModal);$('#cr_ok').addEventListener('click',()=>{const n=$('#cr_name').value.trim();if(!n)return toast('新しい名前を入力してください');renameCategoryDef($('#cr_path').value,n);closeModal();});showModal();}
  function openCategoryDeleteModal(){const kind=$('#catKind').value;const list=categoryPaths(kind).filter(c=>!catIsUsed(c.path));if(!list.length)return toast('削除できる未使用カテゴリがありません');$('#modal').innerHTML=`<h3>未使用カテゴリ削除</h3><p class="hint">取引・予算・固定費・テンプレで使われていないカテゴリだけ削除できます。</p><div class="field"><label>削除対象</label><select id="cd_path">${list.map(c=>`<option value="${c.path}">${esc(c.label)}</option>`).join('')}</select></div><div class="actions"><button class="btn ghost" id="cd_cancel">キャンセル</button><button class="btn danger" id="cd_ok">削除</button></div>`;$('#cd_cancel').addEventListener('click',closeModal);$('#cd_ok').addEventListener('click',()=>{if(confirm('この未使用カテゴリを削除しますか？')){deleteUnusedCategory($('#cd_path').value);closeModal();}});showModal();}

  function addCategory() { const kind = $('#catKind').value, top = $('#catTop').value.trim(), mid = $('#catMid').value.trim(), leaf = $('#catLeaf').value.trim(); if (!top) return toast('大カテゴリは必須です'); const root = state.categories[kind]; if (!root[top]) root[top] = {}; if (mid) { if (!root[top][mid]) root[top][mid] = []; if (leaf && !root[top][mid].includes(leaf)) root[top][mid].push(leaf); } persist(); renderCatTree(); refreshDatalists(); $('#catMid').value = ''; $('#catLeaf').value = ''; toast('カテゴリを追加しました ✓'); }

  function renderReadings() {
    const host = $('#readingList'); if (!host) return; const entries = Object.entries(state.readings || {});
    host.innerHTML = entries.length ? entries.sort((a, b) => a[0].localeCompare(b[0], 'ja')).map(([k, v]) => `<div class="reading-row"><span class="rk">${esc(k)}</span><span class="ry">${esc(v)}</span><div class="row" style="gap:6px"><button class="btn ghost sm" data-rdedit="${esc(k)}">編集</button><button class="btn danger sm" data-rddel="${esc(k)}">削除</button></div></div>`).join('') : `<p class="muted">読み仮名の登録はありません。入力時に自動記録されるほか、ここで手動追加できます。</p>`;
    $$('[data-rdedit]', host).forEach(b => b.addEventListener('click', () => openReadingModal(b.dataset.rdedit)));
    $$('[data-rddel]', host).forEach(b => b.addEventListener('click', () => { delete state.readings[b.dataset.rddel]; persist(); renderReadings(); toast('削除しました'); }));
  }
  function openReadingModal(key) {
    const editing = key != null && state.readings[key] != null; const k0 = editing ? key : ''; const v0 = editing ? state.readings[key] : '';
    $('#modal').innerHTML = `<h3>${editing ? '読み仮名を編集' : '読み仮名を追加'}</h3><div class="field"><label>表示名（店名・品目など）</label><input id="rd_key" value="${esc(k0)}" placeholder="例: 紀伊國屋書店"></div><div class="field"><label>よみ（ひらがな）</label><input id="rd_yomi" value="${esc(v0)}" placeholder="例: きのくにやしょてん"></div><p class="hint">登録すると、その表示名を「よみ」でも検索できます。</p><div class="actions"><button class="btn ghost" id="rd_cancel">キャンセル</button><button class="btn" id="rd_ok">保存</button></div>`;
    $('#rd_cancel').addEventListener('click', closeModal);
    $('#rd_ok').addEventListener('click', () => { const k = $('#rd_key').value.trim(); const v = $('#rd_yomi').value.trim(); if (!k || !v) return toast('表示名とよみを入力してください'); if (editing && k !== key) delete state.readings[key]; state.readings[k] = v; persist(); closeModal(); renderReadings(); toast('保存しました ✓'); });
    showModal();
  }

  function renderTplBar() {
    const bar = $('#tplBar'); if (!bar) return;
    if (!state.templates.length) bar.innerHTML = `<span class="lbl">テンプレなし（設定で追加）</span> <button class="tpl-chip" id="tplSaveCur">＋現在の入力を保存</button>`;
    else bar.innerHTML = `<span class="lbl">テンプレ:</span>` + state.templates.map(t => `<button class="tpl-chip" data-tpl="${t.id}">${esc(t.name)}</button>`).join('') + ` <button class="tpl-chip" id="tplSaveCur" style="border-color:var(--accent);color:var(--accent)">＋現在を保存</button>`;
    $$('#tplBar [data-tpl]').forEach(b => b.addEventListener('click', () => loadTemplate(b.dataset.tpl)));
    const sc = $('#tplSaveCur'); if (sc) sc.addEventListener('click', saveCurrentAsTemplate);
  }
  function loadTemplate(id) { const t = state.templates.find(x => x.id === id); if (!t) return; ui._store = t.store || ''; ui._branch = t.branch || ''; ui.exp.debits = (t.items && t.items.length) ? t.items.map(it => ({ path: it.catPath, amt: it.amount ? String(it.amount) : '', ratio: '' })) : [{ path: '', amt: '', ratio: '' }]; ui.exp.credits = [{ accId: t.creditAccId || '', amt: '' }]; ui.exp.detail = false; ui.exp.total = ''; renderEntry(); const first = $('#debitArea .d_amt'); if (first) first.focus(); toast(`テンプレ「${t.name}」を読み込みました。金額を入力してください`); }
  function saveCurrentAsTemplate() { syncExpFromDOM(); const items = ui.exp.debits.filter(d => d.path).map(d => ({ catPath: d.path, amount: 0 })); if (!items.length) return toast('明細のカテゴリを1つ以上入れてください'); const name = prompt('テンプレ名を入力', ui._store || 'テンプレ'); if (!name) return; const creditAccId = (ui.exp.credits[0] && ui.exp.credits[0].accId) || (accountsBy(a => a.subtype === 'cash')[0] || {}).id || ''; state.templates.push({ id: 'tpl_' + Math.random().toString(36).slice(2, 8), name: name.trim(), store: ui._store || '', branch: ui._branch || '', creditAccId, padMode: 'calc', items }); persist(); renderTplBar(); toast('テンプレを保存しました ✓'); }
  function renderTplList() { const host = $('#tplList'); if (!host) return; host.innerHTML = state.templates.length ? state.templates.map(t => `<div class="rec-row"><div class="rn"><div class="acc-name">${esc(t.name)} <span class="tag">${t.padMode === 'receipt' ? 'レシート' : '電卓'}</span></div><div class="acc-sub">${t.store ? esc(t.store) + (t.branch ? ' / ' + esc(t.branch) : '') + ' ・ ' : ''}${t.items.map(it => it.catPath.replace(/^exp>/, '').split('>').slice(-1)[0]).join('・')} ・ ${accName(t.creditAccId)}</div></div><div class="row" style="gap:6px"><button class="btn ghost sm" data-tpledit="${t.id}">編集</button><button class="btn danger sm" data-tpldel="${t.id}">削除</button></div></div>`).join('') : `<p class="muted">テンプレがありません。入力画面で組み立てて「現在を保存」も便利です。</p>`; $$('[data-tpledit]', host).forEach(b => b.addEventListener('click', () => openTplModal(b.dataset.tpledit))); $$('[data-tpldel]', host).forEach(b => b.addEventListener('click', () => { if (!confirm('テンプレを削除しますか？')) return; state.templates = state.templates.filter(t => t.id !== b.dataset.tpldel); persist(); renderTplList(); toast('削除しました'); })); }
  function openTplModal(id) {
    const editing = id ? state.templates.find(t => t.id === id) : null; const t = editing || { id: 'tpl_' + Math.random().toString(36).slice(2, 8), name: '', store: '', branch: '', creditAccId: (accountsBy(a => a.subtype === 'cash')[0] || {}).id || '', padMode: 'calc', items: [{ catPath: 'exp>食費>食材>主食', amount: 0 }] }; let items = t.items.map(it => ({ ...it }));
    const draw = () => { $('#modal').innerHTML = `<h3>${editing ? 'テンプレを編集' : 'テンプレを追加'}</h3><div class="field"><label>テンプレ名</label><input id="tp_name" value="${esc(t.name)}" placeholder="例: いつものスーパー"></div><div class="row"><div class="field" style="flex:2"><label>店名(任意)</label><input id="tp_store" value="${esc(t.store)}"></div><div class="field"><label>支店(任意)</label><input id="tp_branch" value="${esc(t.branch)}"></div></div><div class="row"><div class="field"><label>支払手段</label><select id="tp_acc">${accountOptions(a => a.subtype !== 'voucher_goods', t.creditAccId)}</select></div><div class="field"><label>入力方式</label><select id="tp_pad"><option value="calc" ${t.padMode !== 'receipt' ? 'selected' : ''}>電卓</option><option value="receipt" ${t.padMode === 'receipt' ? 'selected' : ''}>レシート</option></select></div></div><label>明細カテゴリ（金額は呼び出し後に入力）</label><div id="tp_items">${items.map((it, i) => `<div class="line-row" data-i="${i}"><div class="field cat"><select class="tp_cat catsel">${categoryOptions('expense', it.catPath)}</select></div><div><button class="btn ghost sm tp_del">✕</button></div></div>`).join('')}</div><button class="btn ghost sm" id="tp_add">＋明細を追加</button><div class="actions"><button class="btn ghost" id="tp_cancel">キャンセル</button><button class="btn" id="tp_save">保存</button></div>`;
      $$('#tp_items .line-row').forEach(row => { const i = +row.dataset.i; row.querySelector('.tp_cat').addEventListener('change', e => items[i].catPath = e.target.value); row.querySelector('.tp_del').addEventListener('click', () => { syncTp(); items.splice(i, 1); if (!items.length) items.push({ catPath: 'exp>食費>食材>主食', amount: 0 }); draw(); }); });
      $('#tp_add').addEventListener('click', () => { syncTp(); items.push({ catPath: 'exp>食費>食材>主食', amount: 0 }); draw(); }); $('#tp_cancel').addEventListener('click', closeModal); decorateInputs($('#modal'));
      $('#tp_save').addEventListener('click', () => { syncTp(); const name = $('#tp_name').value.trim(); if (!name) return toast('テンプレ名を入れてください'); t.name = name; t.store = $('#tp_store').value; t.branch = $('#tp_branch').value; t.creditAccId = $('#tp_acc').value; t.padMode = $('#tp_pad').value; t.items = items.map(it => ({ catPath: it.catPath, amount: 0 })); if (!editing) state.templates.push(t); persist(); closeModal(); renderTplList(); renderTplBar(); toast('保存しました ✓'); });
      function syncTp() { $$('#tp_items .line-row').forEach(row => { const i = +row.dataset.i; items[i].catPath = row.querySelector('.tp_cat').value; }); }
    };
    draw(); showModal();
  }

  

/* ============ Excelインポート（移行専用 v1.6.2） ============ */
let excelImport = null;
const XL_GOODS = ['らんぷチケット','コメダチケット','るぱんチケット','松屋コーヒーチケット','松屋チケット','星野チケット','株主優待券'];
function xlStr(v){ return v == null ? '' : String(v).trim(); }
function xlNum(v){ if(v==null || v==='') return null; if(typeof v==='number') return isFinite(v)?v:null; const n=+String(v).replace(/[,¥\s]/g,''); return isFinite(n)?n:null; }
function xlDate(v){
 if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
 if(typeof v==='number' && window.XLSX && XLSX.SSF){ const d=XLSX.SSF.parse_date_code(v); if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`; }
 const s=xlStr(v); const m=s.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/); if(!m) return '';
 let a=+m[1],b=+m[2],c=+m[3]; if(a<=12 && c>1900) return `${c}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`; return `${a}-${String(b).padStart(2,'0')}-${String(c).padStart(2,'0')}`;
}
function importExcel(file){
 if(!window.XLSX) return toast('Excel読込ライブラリを読み込めませんでした。オンラインで再読み込みしてください。');
 const r=new FileReader();
 r.onload=()=>{ try{ const wb=XLSX.read(r.result,{type:'array',cellDates:true,raw:true}); const sheets=wb.SheetNames.map(n=>xlParseSheet(n,wb.Sheets[n])).filter(x=>x.rows.length); if(!sheets.length) throw new Error('取込できる行がありません'); excelImport={fileName:file.name,sheets,selected:sheets.reduce((b,x,i)=>x.rows.length>sheets[b].rows.length?i:b,0),aliases:{},types:{}}; xlOpenModal(); }catch(e){ console.error(e); toast('Excel読込失敗: '+e.message); } };
 r.readAsArrayBuffer(file);
}
function xlParseSheet(name,ws){
 const a=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null}); const rows=[]; const issues=[];
 for(let i=1;i<a.length;i++){ const r=a[i]||[]; if(!r.some(v=>v!=null && String(v).trim()!=='')) continue; const rec={sheet:name,rowNo:i+1,date:xlDate(r[0]),store:xlStr(r[1]),branch:xlStr(r[2]),income:xlNum(r[3]),credit:xlNormAcc(r[4]),expense:xlNum(r[5]),pay:xlNormAcc(r[6]),balance:xlNum(r[7]),kou:xlStr(r[8]),me:xlStr(r[9]),sai:xlStr(r[10]),medical:xlNum(r[11]),memo:xlStr(r[12])}; if(!rec.date){issues.push(`${i+1}行目: 日付がないため除外`); continue;} rows.push(rec); }
 return {name,rows,issues};
}
function xlOpenModal(){
 const opts=excelImport.sheets.map((s,i)=>`<option value="${i}" ${i===excelImport.selected?'selected':''}>${esc(s.name)}（${s.rows.length}行）</option>`).join('');
 $('#modal').innerHTML=`<h3>Excel読込（移行専用 v1.6.2）</h3><p class="hint">Excel家計簿を複式形式へ変換します。Sheet1が抜粋、Sheet2が全期間の場合はSheet2を選んでください。</p><div class="field"><label>取込シート</label><select id="xl_sheet">${opts}</select></div><div id="xl_preview"></div><div class="field"><label>取込方法</label><label style="margin:6px 0"><input type="radio" name="xl_mode" value="replace" checked style="width:auto"> <b>移行用に置き換え</b>：口座と取引をExcelベースに置換（おすすめ）</label><label style="margin:6px 0"><input type="radio" name="xl_mode" value="append" style="width:auto"> <b>追加</b>：既存データを残して取引を追加</label></div><div class="actions"><button class="btn ghost" id="xl_cancel">キャンセル</button><button class="btn" id="xl_ok">取り込む</button></div>`;
 $('#xl_cancel').addEventListener('click',closeModal); $('#xl_sheet').addEventListener('change',e=>{excelImport.selected=+e.target.value;xlPreview();}); $('#xl_ok').addEventListener('click',xlCommit); xlPreview(); showModal();
}
function xlRawAccounts(sheet){ const set=new Set(); sheet.rows.forEach(r=>[r.credit,r.pay].forEach(x=>{if(x)set.add(x)})); return [...set].sort((a,b)=>a.localeCompare(b,'ja')); }
function xlAliasValue(raw){ return (excelImport&&excelImport.aliases&&excelImport.aliases[raw]) || xlNormAcc(raw); }
function xlPreview(){ const b=xlBuild(excelImport.sheets[excelImport.selected]); const r=b.report; $('#xl_preview').innerHTML=`<div class="excel-mini"><span class="tag">対象 ${r.rows}行</span><span class="tag">取引 ${b.transactions.length}件</span><span class="tag">支出 ${r.kinds.expense}</span><span class="tag">収入 ${r.kinds.income}</span><span class="tag">チャージ ${r.kinds.transfer}</span><span class="tag">前払 ${r.kinds.prepaid}</span><span class="tag">医療 ${r.kinds.medical}</span></div><details open><summary>口座名統合・種類</summary>${xlRawAccounts(excelImport.sheets[excelImport.selected]).map(a=>`<div class="alias-row"><div class="muted">${esc(a)}</div><input data-xlalias="${esc(a)}" value="${esc(xlAliasValue(a))}"><select data-xltype="${esc(a)}">${Object.keys(M.ACCOUNT_SUBTYPES).map(k=>`<option value="${k}" ${xlSubtype(a)===k?'selected':''}>${M.ACCOUNT_SUBTYPES[k].label}</option>`).join('')}</select></div>`).join('')}</details><details open><summary>検出口座</summary><div class="excel-tablewrap"><table><thead><tr><th>口座</th><th>種類</th><th class="num">推定期首</th></tr></thead><tbody>${b.accounts.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(M.ACCOUNT_SUBTYPES[a.subtype]?.label||a.subtype)}</td><td class="num">${yen(a.opening||0)}</td></tr>`).join('')}</tbody></table></div></details>${r.issues.length?`<details open><summary>注意 ${r.issues.length}件</summary><ul class="excel-issues">${r.issues.slice(0,20).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}`; $$('[data-xlalias]').forEach(i=>i.addEventListener('input',()=>{excelImport.aliases[i.dataset.xlalias]=i.value.trim();})); $$('[data-xltype]').forEach(i=>i.addEventListener('change',()=>{excelImport.types[i.dataset.xltype]=i.value;})); }
function xlCommit(){ const mode=($('input[name=xl_mode]:checked')||{}).value||'replace'; const sheet=excelImport.sheets[excelImport.selected]; const b=xlBuild(sheet); if(!b.transactions.length) return toast('取込できる取引がありません'); if(!confirm(`Excelから ${b.transactions.length}件を取り込みます。よろしいですか？`)) return; state.categories=b.categories; if(mode==='replace'){ state.accounts=b.accounts; state.transactions=b.transactions; } else { const names=new Set(state.accounts.map(a=>a.name)); b.accounts.forEach(a=>{if(!names.has(a.name)) state.accounts.push(a);}); const ids=new Set(state.transactions.map(t=>t.id)); b.transactions.forEach(t=>{if(!ids.has(t.id)) state.transactions.push(t);}); } state.meta=state.meta||{}; state.meta.lastExcelImport={fileName:excelImport.fileName,sheet:sheet.name,rows:sheet.rows.length,txCount:b.transactions.length,importedAt:new Date().toISOString(),mode}; persist(); closeModal(); refreshDatalists(); renderAll(); updateGlobalNotice(); switchTab('list'); toast(`Excelを取り込みました ✓ ${b.transactions.length}件`); }
function xlBuild(sheet){
 const cats=M.deepClone(state.categories||M.DEFAULT_CATEGORIES); xlEnsureCats(cats); const accMap=new Map(), accounts=[]; const existing=new Map(state.accounts.map(a=>[a.name,a])); const open=new Map(), cum=new Map(), usedAmt=new Map(), usedQty=new Map(); const report={rows:sheet.rows.length,kinds:{expense:0,income:0,transfer:0,prepaid:0,medical:0},issues:[...(sheet.issues||[])]};
 function acc(name,sub){ name=xlNormAcc(name)||'現金'; if(accMap.has(name)) return accMap.get(name); const ex=existing.get(name); const a=ex?M.deepClone(ex):{id:xlAccId(name,accounts),name,subtype:sub||xlSubtype(name),opening:0}; a.subtype=sub||a.subtype||xlSubtype(name); if(a.subtype==='card'&&!a.card)a.card={closingDay:99,payDay:27,payMonthsAfter:1}; if(a.subtype==='voucher_goods'&&!a.goods)a.goods={openingQty:0}; accMap.set(name,a); accounts.push(a); return a; }
 acc('現金','cash'); acc('銀行(メイン)','bank');
 const ticketUnit=xlTicketUnits(sheet.rows);
 function impact(name,delta,balance,sub){ const a=acc(name,sub); const before=cum.get(a.name)||0; if(balance!=null&&!open.has(a.name)) open.set(a.name,Math.round(balance-before-delta)); cum.set(a.name,before+delta); }
 sheet.rows.forEach(r=>{ const c=xlClass(r,ticketUnit); c.accs.forEach(x=>acc(x.name,x.sub)); c.impacts.forEach(x=>impact(x.name,x.delta,x.balance,x.sub)); if(c.goods){ usedAmt.set(c.goods.name,(usedAmt.get(c.goods.name)||0)+c.goods.amount); usedQty.set(c.goods.name,(usedQty.get(c.goods.name)||0)+1); } if(c.cat)xlEnsurePath(cats,c.cat); });
 accounts.forEach(a=>{ if(open.has(a.name)) a.opening=open.get(a.name); if(a.subtype==='voucher_goods'&&!open.has(a.name)){ const q=usedQty.get(a.name)||0, am=usedAmt.get(a.name)||0; if(q){a.opening=am;a.goods=a.goods||{};a.goods.openingQty=q;} } });
 const txs=[]; sheet.rows.forEach(r=>{ try{ const c=xlClass(r,ticketUnit); const t=xlTx(r,c,acc,report); if(t){t.id=`xls_${xlSlug(sheet.name)}_${r.rowNo}`; t.meta=Object.assign({},t.meta||{},{importedFrom:'excel-v1.6.2',sheet:sheet.name,rowNo:r.rowNo,excel:{kou:r.kou,me:r.me,sai:r.sai,medical:r.medical,memo:r.memo}}); txs.push(t);} }catch(e){report.issues.push(`${r.rowNo}行目: ${e.message}`);} });
 accounts.sort((a,b)=>a.name.localeCompare(b.name,'ja')); return {accounts,transactions:txs,categories:cats,report};
}
function xlClass(r,ticketUnit){ const accs=[],impacts=[]; const aa=(name,sub)=>{name=xlNormAcc(name); if(name)accs.push({name,sub:sub||xlSubtype(name)});}; const ii=(name,delta,balance,sub)=>{name=xlNormAcc(name); if(name)impacts.push({name,delta,balance,sub:sub||xlSubtype(name)});}; let cat='', type='', amount=Math.abs(r.expense||r.income||0), from='', to='', face=0, paid=0, qty=0, goods=null, medical=xlMedical(r);
 if(r.kou==='口座入金'){type='transfer';from='銀行(メイン)';to=r.pay||'現金';amount=Math.abs(r.expense||0);aa(from,'bank');aa(to);ii(to,amount,r.balance);return {type,amount,from,to,cat,accs,impacts,goods,medical};}
 if(r.kou==='チャージ'&&(r.me==='交通'||/マナカ/.test(r.store))){type='expense';from=r.pay||'現金';cat='exp>交通費>電車・バス';aa(from);return {type,amount:Math.abs(r.expense||0),from,cat,accs,impacts,goods,medical};}
 if(r.kou==='チャージ'&&r.me==='外食'&&r.income&&r.expense){type='prepaid_goods';to=xlNormAcc(r.store.replace(/珈琲|コーヒー/g,'')+'チケット');from=r.pay||r.credit||'現金';face=Math.abs(r.income);paid=Math.abs(r.expense);qty=Math.max(1,Math.round(face/(ticketUnit.get(to)||960)));aa(to,'voucher_goods');aa(from);ii(to,face,r.balance,'voucher_goods');return {type,from,to,face,paid,qty,cat,accs,impacts,goods,medical};}
 if(r.kou==='チャージ'||r.me==='チャージ'){type='transfer';to=xlChargeTarget(r);from=r.credit||'現金';amount=Math.abs(r.expense||0);aa(from);aa(to);ii(to,amount,r.balance);return {type,amount,from,to,cat,accs,impacts,goods,medical};}
 if(r.kou==='ポイント'||r.me==='ポイント'){type='income';to=r.pay||r.credit||xlPointTarget(r);amount=Math.abs(r.income!=null?r.income:(r.expense||0));cat='inc>ポイント獲得';aa(to);ii(to,amount,r.balance);return {type,amount,to,cat,accs,impacts,goods,medical};}
 if(r.store==='楽天市場'&&r.branch==='Appleギフト'&&r.me==='積立金'){type='prepaid_amount';to='Appleギフト';from=r.pay||r.credit||'楽天カード';face=paid=Math.abs(r.expense||0);aa(to,'voucher_amount');aa(from);ii(to,face,null,'voucher_amount');return {type,from,to,face,paid,cat,accs,impacts,goods,medical};}
 if(r.income!=null&&!(r.income&&r.expense)){type='income';to=r.pay||r.credit||'銀行(メイン)';amount=Math.abs(r.income);cat=xlIncomeCat(r);aa(to);ii(to,amount,r.balance);return {type,amount,to,cat,accs,impacts,goods,medical,reimbursement:/診療報酬|医療費戻/.test(r.store+r.me+r.kou)};}
 if(r.expense!=null){ if(r.expense<0){type='income';to=r.pay||r.credit||'現金';amount=Math.abs(r.expense);cat='inc>返金';aa(to);return {type,amount,to,cat,accs,impacts,goods,medical};} type='expense';from=r.credit||r.pay||'現金';amount=Math.abs(r.expense);cat=xlExpenseCat(r);aa(from);ii(from,-amount,r.balance); if(xlGoods(from))goods={name:from,amount}; return {type,amount,from,cat,accs,impacts,goods,medical}; }
 return {type:'skip',amount:0,cat,accs,impacts,goods,medical}; }
function xlTx(r,c,acc,report){ if(c.type==='skip'||(!c.amount&&!c.face))return null; const memo=xlMemo(r); let t=null; if(c.type==='expense'){const a=acc(c.from); t=M.buildMulti({date:r.date,debits:[{ref:'cat:'+c.cat,amount:c.amount}],credits:[{ref:'acc:'+a.id,amount:c.amount,qty:xlGoods(a.name)?1:undefined}],store:r.store,branch:r.branch,memo,kind:xlGoods(a.name)?'goods_use':'expense'});report.kinds.expense++;}
 else if(c.type==='income'){const a=acc(c.to); t=M.buildIncome({date:r.date,accId:a.id,catPath:c.cat,amount:c.amount,store:r.store,branch:r.branch,memo});report.kinds.income++;}
 else if(c.type==='transfer'){t=M.buildTransfer({date:r.date,fromAccId:acc(c.from).id,toAccId:acc(c.to).id,amount:c.amount,store:r.store,branch:r.branch,memo});report.kinds.transfer++;}
 else if(c.type==='prepaid_amount'){t=M.buildPrepaidAmount({date:r.date,toAccId:acc(c.to,'voucher_amount').id,fromAccId:acc(c.from).id,face:c.face,paid:c.paid,store:r.store,branch:r.branch,memo});report.kinds.prepaid++;}
 else if(c.type==='prepaid_goods'){const to=acc(c.to,'voucher_goods'),fr=acc(c.from); t=M.buildMulti({date:r.date,debits:[{ref:'acc:'+to.id,amount:c.face,qty:c.qty}],credits:[{ref:'acc:'+fr.id,amount:c.paid}].concat(c.face>c.paid?[{ref:'cat:inc>プレミアム益',amount:c.face-c.paid}]:[]),store:r.store,branch:r.branch,memo,kind:'prepaid_goods'});report.kinds.prepaid++;}
 if(t&&c.medical){t.meta=Object.assign({},t.meta||{},{medical:c.medical});report.kinds.medical++;} if(t&&c.reimbursement)t.meta=Object.assign({},t.meta||{},{medicalReimbursement:true}); return t; }
function xlNormAcc(n){const raw=xlStr(n); let v=raw; if(!v||v==='0')return ''; if(v==='さくカード')v='さくらカード'; if(v==='無印ポイント')v='MUJIポイント'; if(v==='あかのれんP')v='あかのれんポイント'; if(v==='アエナP')v='アエナポイント'; if(excelImport&&excelImport.aliases&&excelImport.aliases[raw]) return excelImport.aliases[raw]; return v;}
function xlSubtype(n){const raw=xlStr(n); if(excelImport&&excelImport.types&&excelImport.types[raw]) return excelImport.types[raw]; n=xlNormAcc(n); if(!n||n==='現金')return 'cash'; if(/銀行|口座/.test(n))return 'bank'; if(/楽天カード/.test(n))return 'card'; if(xlGoods(n))return 'voucher_goods'; if(/ギフト|商品券|Vプリカ/.test(n))return 'voucher_amount'; if(/ポイント|値引き|P$/.test(n))return 'point'; if(n==='マナカ')return 'transit'; return 'emoney';}
function xlGoods(n){n=xlNormAcc(n); return XL_GOODS.includes(n)||/チケット|優待券/.test(n);}
function xlChargeTarget(r){if(r.pay)return r.pay; const s=r.store+r.branch; if(/平和堂/.test(s))return'HOPマネー'; if(/イオン/.test(s))return'WAON'; if(/スギヤマ/.test(s))return'スギヤママネー'; if(/エクボ/.test(s))return'さくらカード'; if(/コノミヤ/.test(s))return'コノミヤカード'; return'現金';}
function xlPointTarget(r){const s=r.store+r.branch; if(/平和堂/.test(s))return'HOPマネー'; if(/イオン/.test(s))return'WAON'; return r.pay||r.credit||'現金';}
function xlIncomeCat(r){const k=r.me||r.kou||r.store; if(/賞与/.test(k))return'inc>賞与'; if(/給与/.test(k))return'inc>給与'; if(/旅費/.test(k))return'inc>旅費精算'; if(/還付/.test(k))return'inc>還付金'; if(/診療報酬|医療/.test(k)||/診療報酬/.test(r.store))return'inc>医療費戻入'; if(/ポイント/.test(k))return'inc>ポイント獲得'; return'inc>その他収入';}
function xlExpenseCat(r){const me=r.me||r.kou||'',s=r.sai||'',st=r.store||''; if(/医療交通/.test(me))return'exp>医療・健康>通院交通費'; if(/医療医薬|医薬品/.test(me)||r.kou==='医療費')return'exp>医療・健康>診察・薬'; if(/食材/.test(me))return s?`exp>食費>食材>${xlLeaf(s)}`:'exp>食費>食材'; if(/外食/.test(me))return'exp>食費>外食'; if(/日用品/.test(me)||/日用品費/.test(r.kou)){if(/被服|靴/.test(s))return'exp>被服・美容>衣類'; return'exp>日用品';} if(/光熱水/.test(me)){if(/電気/.test(st))return'exp>水道光熱費>電気'; if(/ガス/.test(st))return'exp>水道光熱費>ガス'; if(/水道/.test(st))return'exp>水道光熱費>水道'; return'exp>水道光熱費>その他';} if(/通信/.test(me)){return /携帯/.test(st)?'exp>通信費>携帯':'exp>通信費>ネット';} if(/交通|交通費/.test(me)||/定期券|免許|近鉄|新幹線|交通局/.test(st))return'exp>交通費>電車・バス'; if(/家賃/.test(me))return'exp>住居>家賃'; if(/保険/.test(me))return'exp>税・社会保険>保険'; if(/税金|国民年金/.test(me)||/税金/.test(r.kou))return'exp>税・社会保険>税金'; if(/趣味/.test(me))return'exp>趣味・娯楽'; if(/交際/.test(me))return'exp>交際費'; if(/特別/.test(me)||/特別/.test(r.kou))return'exp>その他>特別費'; return'exp>その他>雑費';}
function xlLeaf(s){s=xlStr(s); if(/健康食品/.test(s))return'健康食品'; if(/被服/.test(s))return'衣類'; return s.replace(/費$/,'')||'その他';}
function xlEnsureCats(c){['給与','賞与','旅費精算','還付金','医療費戻入','ポイント獲得','プレミアム益','返金','その他収入'].forEach(k=>{if(!c.income[k])c.income[k]={};}); c.expense['その他']=c.expense['その他']||{}; c.expense['その他']['特別費']=c.expense['その他']['特別費']||[]; c.expense['医療・健康']=c.expense['医療・健康']||{}; c.expense['医療・健康']['通院交通費']=c.expense['医療・健康']['通院交通費']||[]; c.expense['水道光熱費']=c.expense['水道光熱費']||{}; c.expense['水道光熱費']['その他']=c.expense['水道光熱費']['その他']||[]; c.expense['税・社会保険']=c.expense['税・社会保険']||{}; c.expense['税・社会保険']['保険']=c.expense['税・社会保険']['保険']||[]; c.expense['税・社会保険']['税金']=c.expense['税・社会保険']['税金']||[];}
function xlEnsurePath(c,path){const [k,...p]=path.split('>'); const root=k==='inc'?c.income:c.expense; if(k==='inc'){root[p[0]]=root[p[0]]||{};return;} root[p[0]]=root[p[0]]||{}; if(p[1]){root[p[0]][p[1]]=root[p[0]][p[1]]||[]; if(p[2]&&!root[p[0]][p[1]].includes(p[2]))root[p[0]][p[1]].push(p[2]);}}
function xlMedical(r){ if(r.medical==null&&r.kou!=='医療費'&&!/医療/.test(r.me||''))return null; return{eligibleAmount:r.medical==null?Math.abs(r.expense||0):r.medical,personMemo:r.memo||'',kind:/交通/.test(r.me||'')?'通院交通費':(/医薬品/.test(r.me||'')?'OTC候補':'通常医療費')};}
function xlMemo(r){const a=[]; if(r.memo)a.push(r.memo); if(r.medical!=null)a.push('医療費控除対象額:'+r.medical); if(r.kou)a.push('項:'+r.kou); return a.join(' / ');}
function xlTicketUnits(rows){const m=new Map(); rows.forEach(r=>{const n=xlNormAcc(r.credit||r.pay),am=Math.abs(r.expense||0); if(n&&am&&xlGoods(n)){const c=m.get(n)||new Map(); c.set(am,(c.get(am)||0)+1); m.set(n,c);}}); const out=new Map(); m.forEach((c,n)=>{out.set(n,[...c.entries()].sort((a,b)=>b[1]-a[1])[0][0]);}); return out;}
function xlAccId(n,arr){let b='a_xl_'+xlSlug(n),id=b,i=2; const ids=new Set(state.accounts.map(a=>a.id).concat(arr.map(a=>a.id))); while(ids.has(id))id=b+'_'+i++; return id;}
function xlSlug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24)||Math.random().toString(36).slice(2,8);}

function download(name, text, type) { const blob = new Blob([text], { type }); const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function exportJSON() { download(`kakeibo_${M.todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('書き出しました'); }
  function exportCSV() { download(`kakeibo_${M.todayStr()}.csv`, '\ufeff' + M.serializeCSV(state), 'text/csv;charset=utf-8'); toast('CSVを書き出しました'); }
  function importJSON(file) { const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(r.result); if (!data.accounts || !data.transactions) throw new Error('形式が不正'); if (!confirm('現在のデータを置き換えます。よろしいですか？')) return; state = M.migrate(data); persist(); refreshDatalists(); renderAll(); updateGlobalNotice(); toast('読み込みました ✓'); } catch (e) { toast('読み込み失敗: ' + e.message); } }; r.readAsText(file); }
  function importCSV(file) { const r = new FileReader(); r.onload = () => { try { let text = r.result; if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); const txs = M.parseCSV(text, state); if (!txs.length) throw new Error('取引が0件です'); openCsvMergeModal(txs); } catch (e) { toast('CSV取込失敗: ' + e.message); } }; r.readAsText(file); }
  function openCsvMergeModal(txs) { const bad = txs.filter(t => M.validateTransaction(t).length).length; const existIds = new Set(state.transactions.map(t => t.id)); const collide = txs.filter(t => existIds.has(t.id)).length; const fresh = txs.length - collide; $('#modal').innerHTML = `<h3>CSVの取り込み方法</h3><p class="hint">取込 ${txs.length}件（新規 ${fresh} ・ ID重複 ${collide}${bad ? ' ・ 貸借不一致 ' + bad : ''}）。口座・カテゴリ・固定費・予算等は保持されます。</p><div class="field"><label><input type="radio" name="csvmode" value="overwrite" checked style="width:auto"> <b>上書き更新</b>：ID重複は取込で上書き、新規は追加（推奨）</label></div><div class="field"><label><input type="radio" name="csvmode" value="keep" style="width:auto"> <b>既存を保持</b>：ID重複は既存のまま、新規のみ追加</label></div><div class="field"><label><input type="radio" name="csvmode" value="replace" style="width:auto"> <b>全置換</b>：現在の全取引を破棄して置き換え</label></div><div class="actions"><button class="btn ghost" id="csv_cancel">キャンセル</button><button class="btn" id="csv_ok">取り込む</button></div>`; $('#csv_cancel').addEventListener('click', closeModal); $('#csv_ok').addEventListener('click', () => { const mode = ($('input[name=csvmode]:checked') || {}).value || 'overwrite'; const res = M.mergeTransactions(state.transactions, txs, mode); state.transactions = res.list; persist(); refreshDatalists(); renderAll(); updateGlobalNotice(); closeModal(); toast(`取込完了 ✓ 追加${res.added}${res.updated ? ' / 更新' + res.updated : ''}${res.kept ? ' / 保持' + res.kept : ''}`); }); showModal(); }

  function showModal() { $('#modalBg').classList.add('show'); decorateInputs($('#modal')); }
  function closeModal() { $('#modalBg').classList.remove('show'); }

  /* ============ 予算・積立 ============ */
  function renderBudget() {
    if ($('#tab-budget').hidden) return; const ym = currentYM(); const rep = M.budgetReport(state, ym); const overRatio = rep.totalBudget > 0 ? rep.totalSpent / rep.totalBudget : 0;
    if ($('#budRollover')) $('#budRollover').checked = !!state.budgetRollover;
    $('#budgetCards').innerHTML = [['予算合計', yen(rep.totalBudget), ''], ['支出合計', yen(rep.totalSpent), rep.totalSpent > rep.totalBudget ? 'neg' : ''], ['残り', yen(rep.totalRemain), rep.totalRemain < 0 ? 'neg' : 'pos']].map(([k, v, c]) => `<div class="stat"><div class="k">${k}（${ym}）</div><div class="v ${c}">${v}</div><div class="sub">${k === '支出合計' ? Math.round(overRatio * 100) + '% 消化' : (k === '予算合計' && rep.rollover ? '繰越込み' : '')}</div></div>`).join('');
    $('#budgetList').innerHTML = rep.entries.length ? rep.entries.map(e => { const p = Math.round(e.ratio * 100); const cls = e.ratio >= 1 ? 'over' : (e.ratio >= 0.8 ? 'warn' : ''); const carryHtml = (rep.rollover && Math.abs(e.carry) > 0.5) ? ` <span class="acc-sub">(基準 ${yen(e.budget)} ${e.carry >= 0 ? '＋繰越 ' : '−超過 '}${yen(Math.abs(e.carry))})</span>` : ''; return `<div class="bud-row"><div class="bud-head"><div><span class="bud-name">${esc(e.label)}</span> <span class="acc-sub">${p}% 消化</span>${carryHtml}</div><div class="bud-fig">${yen(e.spent)} / ${yen(e.effective)} ・ 残 <b class="${e.remain < 0 ? 'neg' : 'pos'}">${yen(e.remain)}</b> <button class="btn ghost sm" data-budedit="${esc(e.catPath)}">編集</button> <button class="btn danger sm" data-buddel="${esc(e.catPath)}">削除</button></div></div><div class="bar ${cls}"><span style="width:${Math.min(100, p)}%"></span></div></div>`; }).join('') : `<p class="muted">予算が未設定です。「＋予算」から追加してください。</p>`;
    $$('[data-budedit]', $('#budgetList')).forEach(b => b.addEventListener('click', () => openBudgetModal(b.dataset.budedit)));
    $$('[data-buddel]', $('#budgetList')).forEach(b => b.addEventListener('click', () => { delete state.budgets[b.dataset.buddel]; persist(); renderBudget(); renderDrill(); toast('予算を削除しました'); }));
  }
  function openBudgetModal(catPath) { const editing = catPath != null; const cur = editing ? state.budgets[catPath] : 0; const opts = M.budgetableCategories(state.categories).map(c => `<option value="${c.path}" ${c.path === catPath ? 'selected' : ''}>${c.label}</option>`).join(''); $('#modal').innerHTML = `<h3>${editing ? '予算を編集' : '予算を設定'}</h3><div class="field"><label>カテゴリ（大/中/小どの階層でもOK）</label><select id="bud_cat" class="catsel" ${editing ? 'disabled' : ''}>${opts}</select></div><div class="field"><label>月予算</label><input type="number" id="bud_amt" value="${cur || ''}" placeholder="例: 40000"></div><p class="hint">この階層＋配下すべての支出を合計。分析画面にも表示されます。</p><div class="actions"><button class="btn ghost" id="bud_cancel">キャンセル</button><button class="btn" id="bud_ok">保存</button></div>`; $('#bud_cancel').addEventListener('click', closeModal); $('#bud_ok').addEventListener('click', () => { const path = editing ? catPath : $('#bud_cat').value; const amt = +$('#bud_amt').value; if (!amt) return toast('金額を入れてください'); state.budgets[path] = amt; persist(); closeModal(); renderBudget(); renderDrill(); toast('保存しました ✓'); }); showModal(); }

  function effectiveSurplus() { return (simSurplus != null) ? simSurplus : M.avgMonthlySurplus(state, currentYM(), 3); }
  function renderGoals() {
    const ym = currentYM(); const surplus = effectiveSurplus(); const avg = M.avgMonthlySurplus(state, ym, 3);
    if ($('#simSurplus') && document.activeElement !== $('#simSurplus')) $('#simSurplus').value = surplus;
    if ($('#simHint')) $('#simHint').textContent = `直近3か月の平均余剰（収入−支出）は ${yen(avg)}。ここを積立に回せる額の目安に。`;
    renderGoalTimeline(surplus);
    const sim = M.simulateGoals(state, ym, surplus); const simById = {}; sim.forEach(g => simById[g.id] = g);
    const goals = state.goals.slice().sort((a, b) => (a.priority - b.priority) || String(a.targetYM || '9999').localeCompare(String(b.targetYM || '9999')));
    $('#goalList').innerHTML = goals.length ? goals.map(g => { const remain = Math.max(0, (g.target || 0) - (g.saved || 0)); const p = M.pct(g.saved || 0, g.target || 1); const req = M.goalRequiredMonthly(g, ym); const s = simById[g.id]; const proj = s ? s.doneYM : null; let status = 'none', statusText = '期限なし'; if (g.targetYM) { if (remain <= 0) { status = 'ok'; statusText = '達成済み'; } else if (proj && proj <= g.targetYM) { status = 'ok'; statusText = '間に合う見込み'; } else { status = 'behind'; statusText = '遅れる見込み'; } } else if (remain <= 0) { status = 'ok'; statusText = '達成済み'; } const cls = p >= 100 ? '' : (p >= 80 ? 'warn' : ''); return `<div class="goal-card"><div class="goal-top"><div><div class="goal-name">${esc(g.name)}</div><div class="goal-meta">優先度 ${g.priority || 3}${g.targetYM ? ' ・ 目標 ' + g.targetYM : ' ・ 期限なし'}${g.linkedAccId ? ' ・ 紐付 ' + accName(g.linkedAccId) : ''}${g.note ? ' ・ ' + esc(g.note) : ''}</div></div><span class="goal-status ${status}">${statusText}</span></div><div class="bar ${cls}" style="margin:10px 0"><span style="width:${Math.min(100, p)}%"></span></div><div class="goal-figs"><div><div class="fk">積立済 / 目標</div><div class="fv">${yen(g.saved || 0)} / ${yen(g.target || 0)}（${p}%）</div></div><div><div class="fk">残り</div><div class="fv">${yen(remain)}</div></div>${g.targetYM ? `<div><div class="fk">必要月額</div><div class="fv">${req == null ? '—' : yen(req)}</div></div>` : ''}<div><div class="fk">この配分での達成</div><div class="fv">${remain <= 0 ? '完了' : (proj || '20年以上')}</div></div></div><div class="row" style="gap:6px"><button class="btn ghost sm" data-goalsave="${g.id}">積立を記録</button><button class="btn ghost sm" data-goaledit="${g.id}">編集</button><button class="btn danger sm" data-goaldel="${g.id}">削除</button></div></div>`; }).join('') : `<p class="muted">目標がありません。「＋目標」から作成してください。</p>`;
    $$('[data-goaledit]', $('#goalList')).forEach(b => b.addEventListener('click', () => openGoalModal(b.dataset.goaledit)));
    $$('[data-goaldel]', $('#goalList')).forEach(b => b.addEventListener('click', () => { if (!confirm('目標を削除しますか？')) return; state.goals = state.goals.filter(g => g.id !== b.dataset.goaldel); state.wishlist.forEach(w => { if (w.goalId === b.dataset.goaldel) w.goalId = null; }); persist(); renderGoals(); renderWishlist(); toast('削除しました'); }));
    $$('[data-goalsave]', $('#goalList')).forEach(b => b.addEventListener('click', () => openGoalSaveModal(b.dataset.goalsave)));
  }
  function renderGoalTimeline(surplus) {
    const host = $('#goalTimeline'); if (!host) return; const ym = currentYM(); const tl = M.goalTimeline(state, ym, surplus); if (!tl.rows.length) { host.innerHTML = ''; return; }
    const span = Math.max(1, tl.maxIdx - tl.startIdx); const startIdx = tl.startIdx; const axisMonths = tl.months.filter((m, i) => i % Math.ceil(tl.months.length / 8) === 0);
    const rows = tl.rows.map((r, i) => { const col = PALETTE[i % PALETTE.length]; const doneIdx = r.doneYM ? M.ymIndex(r.doneYM) : tl.maxIdx; const widthPct = Math.min(100, (doneIdx - startIdx) / span * 100); const savedW = widthPct * r.savedRatio; const tgt = r.targetYM ? Math.min(100, (M.ymIndex(r.targetYM) - startIdx) / span * 100) : null; const doneLbl = r.doneYM ? (r.doneYM === ym ? '完了' : r.doneYM) : '20年+'; return `<div class="gantt-row"><div class="gantt-label" title="${esc(r.name)}">${esc(r.name)}</div><div class="gantt-track"><div class="gantt-bar" style="left:0%; width:${widthPct}%; background:${col}; opacity:.35"></div><div class="gantt-bar" style="left:0%; width:${savedW}%; background:${col}"></div>${tgt != null ? `<div class="gantt-target" style="left:${tgt}%" title="目標 ${r.targetYM}"></div>` : ''}<div class="gantt-done" style="left:${Math.min(92, widthPct)}%">${doneLbl}</div></div></div>`; }).join('');
    host.innerHTML = `<div class="gantt"><div class="acc-sub" style="margin-bottom:6px">達成タイムライン（塗り=積立済 / 薄い=このペースでの到達 / 縦線=目標月）</div>${rows}<div class="gantt-axis">${axisMonths.map(m => `<span>${m.slice(2)}</span>`).join('')}</div></div>`;
  }
  function openGoalSaveModal(id) { const g = state.goals.find(x => x.id === id); if (!g) return; const remain = Math.max(0, (g.target || 0) - (g.saved || 0)); $('#modal').innerHTML = `<h3>積立を記録：${esc(g.name)}</h3><p class="hint">仮想封筒への取り分けを記録します（帳簿の仕訳は作りません）。</p><div class="field"><label>今回積み立てる額（残り ${yen(remain)}）</label><input type="number" id="gs_amt" placeholder="例: 20000"></div><div class="field"><label><input type="checkbox" id="gs_xfer" style="width:auto" ${g.linkedAccId ? '' : 'disabled'}> 同時に振替も記帳する${g.linkedAccId ? '（→ ' + accName(g.linkedAccId) + '）' : '（紐付口座なし）'}</label></div><div id="gs_xferFields" style="display:none"><div class="field"><label>振替元口座</label><select id="gs_from">${accountOptions(a => ['bank', 'cash'].includes(a.subtype))}</select></div></div><div class="actions"><button class="btn ghost" id="gs_cancel">キャンセル</button><button class="btn" id="gs_ok">記録</button></div>`; $('#gs_xfer').addEventListener('change', e => $('#gs_xferFields').style.display = e.target.checked ? '' : 'none'); $('#gs_cancel').addEventListener('click', closeModal); $('#gs_ok').addEventListener('click', () => { const amt = +$('#gs_amt').value; if (!amt) return toast('金額を入れてください'); g.saved = (g.saved || 0) + amt; if ($('#gs_xfer').checked && g.linkedAccId) { const from = $('#gs_from').value; if (from && from !== g.linkedAccId) state.transactions.push(M.buildTransfer({ date: M.todayStr(), fromAccId: from, toAccId: g.linkedAccId, amount: amt, store: '積立', memo: '積立: ' + g.name })); } persist(); closeModal(); renderGoals(); renderAccounts(); renderList(); toast('積立を記録しました ✓'); }); showModal(); }
  function openGoalModal(id) { const editing = id ? state.goals.find(g => g.id === id) : null; const g = editing || { id: 'g_' + Math.random().toString(36).slice(2, 8), name: '', target: 0, targetYM: '', saved: 0, priority: 3, note: '', linkedAccId: null }; $('#modal').innerHTML = `<h3>${editing ? '目標を編集' : '目標を追加'}</h3><div class="field"><label>目標名</label><input id="go_name" value="${esc(g.name)}" placeholder="例: Mac買い替え / 旅行 / 予備資金"></div><div class="row"><div class="field"><label>目標額</label><input type="number" id="go_target" value="${g.target || ''}"></div><div class="field"><label>現在の積立済</label><input type="number" id="go_saved" value="${g.saved || 0}"></div></div><div class="row"><div class="field"><label>目標月（任意）</label><input type="month" id="go_ym" value="${g.targetYM || ''}"></div><div class="field"><label>優先度(1=最優先)</label><input type="number" id="go_pri" min="1" max="9" value="${g.priority || 3}"></div></div><div class="field"><label>紐付ける積立口座（任意）</label><select id="go_acc"><option value="">なし（仮想のみ）</option>${accountOptions(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'asset', g.linkedAccId)}</select></div><div class="field"><label>メモ</label><input id="go_note" value="${esc(g.note || '')}"></div><div class="actions"><button class="btn ghost" id="go_cancel">キャンセル</button><button class="btn" id="go_ok">保存</button></div>`; $('#go_cancel').addEventListener('click', closeModal); $('#go_ok').addEventListener('click', () => { const name = $('#go_name').value.trim(); if (!name) return toast('目標名を入れてください'); const target = +$('#go_target').value; if (!target) return toast('目標額を入れてください'); const obj = editing || g; obj.name = name; obj.target = target; obj.saved = +$('#go_saved').value || 0; obj.targetYM = $('#go_ym').value || null; obj.priority = +$('#go_pri').value || 3; obj.linkedAccId = $('#go_acc').value || null; obj.note = $('#go_note').value; if (!editing) state.goals.push(obj); persist(); closeModal(); renderGoals(); toast('保存しました ✓'); }); showModal(); }

  /* ============ ほしいもの ============ */
  function allWishTags() { const s = new Set(); state.wishlist.forEach(w => (w.tags || []).forEach(t => s.add(t))); return [...s].sort((a, b) => a.localeCompare(b, 'ja')); }
  function renderWishlist() {
    if ($('#tab-wishlist').hidden) return; const tags = allWishTags();
    $('#wishTags').innerHTML = `<span class="muted" style="font-size:12px">表示:</span>` + `<button class="chip-btn ${wishFilter.status === 'active' ? 'active' : ''}" data-st="active">未購入</button>` + `<button class="chip-btn ${wishFilter.status === 'done' ? 'active' : ''}" data-st="done">購入済</button>` + `<button class="chip-btn ${wishFilter.status === 'all' ? 'active' : ''}" data-st="all">すべて</button>` + `<span style="width:8px"></span><span class="muted" style="font-size:12px">タグ:</span>` + `<button class="chip-btn ${wishFilter.tag == null ? 'active' : ''}" data-tag="">全部</button>` + tags.map(t => `<button class="chip-btn ${wishFilter.tag === t ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
    $$('#wishTags [data-st]').forEach(b => b.addEventListener('click', () => { wishFilter.status = b.dataset.st; renderWishlist(); }));
    $$('#wishTags [data-tag]').forEach(b => b.addEventListener('click', () => { wishFilter.tag = b.dataset.tag || null; renderWishlist(); }));
    let list = state.wishlist.slice(); if (wishFilter.status !== 'all') list = list.filter(w => (w.status || 'active') === wishFilter.status); if (wishFilter.tag) list = list.filter(w => (w.tags || []).includes(wishFilter.tag)); list.sort((a, b) => (a.priority - b.priority) || String(a.desiredYM || '9999').localeCompare(String(b.desiredYM || '9999')));
    const activeAll = state.wishlist.filter(w => (w.status || 'active') === 'active'); const total = activeAll.reduce((s, w) => s + (w.price || 0), 0); const byYM = {}; activeAll.forEach(w => { const k = w.desiredYM || '時期未定'; byYM[k] = (byYM[k] || 0) + (w.price || 0); });
    $('#wishSummary').innerHTML = `未購入 合計 ${yen(total)} ・ ` + Object.entries(byYM).sort().map(([k, v]) => `${k}: ${yen(v)}`).join(' / ');
    $('#wishList').innerHTML = list.length ? list.map(w => { const done = (w.status || 'active') === 'done'; const tagHtml = (w.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' '); return `<div class="wish-row ${done ? 'done' : ''}"><span class="wish-name">${esc(w.name)}<span class="wish-tags">${tagHtml}</span> <span class="acc-sub">優先${w.priority || 3}${w.desiredYM ? ' ・ ' + w.desiredYM + 'ごろ' : ''}${w.store ? ' ・ ' + esc(w.store) : ''}${w.note ? ' ・ ' + esc(w.note) : ''}${w.goalId ? ' ・ <span class="tag best">積立中</span>' : ''}</span></span><span class="wish-price">${yen(w.price || 0)}</span><div class="row" style="gap:6px"><button class="btn ghost sm" data-wishlink="${esc(w.name)}">🔗支出</button><button class="btn ghost sm" data-wishdone="${w.id}">${done ? '未購入に' : '購入済に'}</button>${w.goalId || done ? '' : `<button class="btn ghost sm" data-wishgoal="${w.id}">積立目標に</button>`}<button class="btn ghost sm" data-wishedit="${w.id}">編集</button><button class="btn danger sm" data-wishdel="${w.id}">削除</button></div></div>`; }).join('') : `<p class="muted">該当するほしいものがありません。</p>`;
    $$('[data-wishedit]', $('#wishList')).forEach(b => b.addEventListener('click', () => openWishModal(b.dataset.wishedit)));
    $$('[data-wishdel]', $('#wishList')).forEach(b => b.addEventListener('click', () => { if (!confirm('削除しますか？')) return; state.wishlist = state.wishlist.filter(w => w.id !== b.dataset.wishdel); persist(); renderWishlist(); toast('削除しました'); }));
    $$('[data-wishdone]', $('#wishList')).forEach(b => b.addEventListener('click', () => { const w = state.wishlist.find(x => x.id === b.dataset.wishdone); if (!w) return; w.status = (w.status === 'done') ? 'active' : 'done'; persist(); renderWishlist(); toast(w.status === 'done' ? '購入済にしました' : '未購入に戻しました'); }));
    $$('[data-wishlink]', $('#wishList')).forEach(b => b.addEventListener('click', () => gotoListWithKeyword(b.dataset.wishlink)));
    $$('[data-wishgoal]', $('#wishList')).forEach(b => b.addEventListener('click', () => { const w = state.wishlist.find(x => x.id === b.dataset.wishgoal); if (!w) return; const goal = { id: 'g_' + Math.random().toString(36).slice(2, 8), name: w.name, target: w.price || 0, targetYM: w.desiredYM || null, saved: 0, priority: w.priority || 3, note: w.note || 'ほしいものから', linkedAccId: null }; state.goals.push(goal); w.goalId = goal.id; persist(); renderWishlist(); toast('積立目標に変換しました ✓（積立タブで確認）'); }));
  }
  function openWishModal(id) { const editing = id ? state.wishlist.find(w => w.id === id) : null; const w = editing || { id: 'w_' + Math.random().toString(36).slice(2, 8), name: '', price: 0, desiredYM: '', priority: 3, note: '', goalId: null, tags: [], status: 'active', store: '', url: '' }; const tagSug = allWishTags(); $('#modal').innerHTML = `<h3>${editing ? 'ほしいものを編集' : 'ほしいものを追加'}</h3><div class="field"><label>名称</label><input id="wi_name" value="${esc(w.name)}" placeholder="例: ヘッドホン / 包丁 / クミンパウダー"></div><div class="row"><div class="field"><label>価格(目安)</label><input type="number" id="wi_price" value="${w.price || ''}"></div><div class="field"><label>ほしい時期(任意)</label><input type="month" id="wi_ym" value="${w.desiredYM || ''}"></div><div class="field"><label>優先度(1=高)</label><input type="number" id="wi_pri" min="1" max="9" value="${w.priority || 3}"></div></div><div class="row"><div class="field"><label>買う店(任意)</label><input id="wi_store" list="dl-store" value="${esc(w.store || '')}" placeholder="例: ニトリ / Amazon"></div><div class="field"><label>URL(任意)</label><input id="wi_url" value="${esc(w.url || '')}" placeholder="https://"></div></div><div class="field"><label>タグ（カンマ区切り）</label><input id="wi_tags" value="${esc((w.tags || []).join(', '))}" placeholder="例: ネットで買う, キッチン"></div>${tagSug.length ? `<div class="chips" id="wi_tagsug">${tagSug.map(t => `<button type="button" class="chip-btn" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}<div class="field"><label>メモ</label><input id="wi_note" value="${esc(w.note || '')}"></div><div class="actions"><button class="btn ghost" id="wi_cancel">キャンセル</button><button class="btn" id="wi_ok">保存</button></div>`; $$('#wi_tagsug .chip-btn').forEach(b => b.addEventListener('click', () => { const cur = $('#wi_tags').value.split(',').map(s => s.trim()).filter(Boolean); if (!cur.includes(b.dataset.t)) cur.push(b.dataset.t); $('#wi_tags').value = cur.join(', '); })); $('#wi_cancel').addEventListener('click', closeModal); $('#wi_ok').addEventListener('click', () => { const name = $('#wi_name').value.trim(); if (!name) return toast('名称を入れてください'); const obj = editing || w; obj.name = name; obj.price = +$('#wi_price').value || 0; obj.desiredYM = $('#wi_ym').value || null; obj.priority = +$('#wi_pri').value || 3; obj.store = $('#wi_store').value; obj.url = $('#wi_url').value; obj.tags = $('#wi_tags').value.split(',').map(s => s.trim()).filter(Boolean); obj.note = $('#wi_note').value; if (!editing) { obj.status = 'active'; state.wishlist.push(obj); } persist(); closeModal(); renderWishlist(); toast('保存しました ✓'); }); showModal(); }

  /* ============ 価格比較 ============ */
  const PRICE_UNITS = ['総額', 'g', 'kg', 'ml', 'L', '個', '本', '枚', '杯'];
  const PRICE_PREVIEW = 3;
  function renderPrice() {
    if ($('#tab-price').hidden) return; const items = M.priceItems(state);
    $('#priceList').innerHTML = items.length ? items.map(it => {
      const open = priceOpen.has(it.item); const showAll = priceShowAll.has(it.item);
      const best = it.entries.find(e => e.id === it.bestId);
      const shown = showAll ? it.entries : it.entries.slice(0, PRICE_PREVIEW);
      const rowsHtml = shown.map(e => `<tr class="${e.id === it.bestId ? 'best' : ''}"><td>${e.date}</td><td>${esc(e.store)}${e.branch ? ' <span class="muted">/ ' + esc(e.branch) + '</span>' : ''}</td><td class="num">${yen(e.price)}</td><td class="num">${e.qty}${esc(e.unit)}</td><td class="num">${e.norm ? fmtNorm(e.norm) : '—'} ${e.id === it.bestId ? '<span class="tag best">最安</span>' : ''}</td><td class="muted">${esc(e.note)}</td><td style="white-space:nowrap"><button class="btn ghost sm" data-pledit="${e.id}">編集</button> <button class="btn danger sm" data-pldel="${e.id}">削除</button></td></tr>`).join('');
      const moreBtn = it.entries.length > PRICE_PREVIEW ? `<div class="pl-more"><button class="btn ghost sm" data-plmore="${esc(it.item)}">${showAll ? '直近' + PRICE_PREVIEW + '件に折りたたむ' : '全 ' + it.entries.length + '件を表示'}</button></div>` : '';
      const chart = it.count >= 2 ? drawPriceChart(it.item, priceRange[it.item] || '6') : '';
      return `<div class="pl-item ${open ? 'open' : ''}"><div class="pl-item-head" data-pltoggle="${esc(it.item)}"><span class="pl-item-name"><span class="pl-caret">▶</span> ${esc(it.item)} <span class="acc-sub">${it.count}件・最新 ${it.lastDate}</span></span><span style="display:flex;gap:10px;align-items:center"><span class="pl-best">${best && best.norm ? '最安 ' + esc(best.store) + ' ・ ' + fmtNorm(best.norm) : ''}</span><button class="btn ghost sm" data-pllink="${esc(it.item)}">🔗支出</button></span></div><div class="pl-body"><div style="overflow:auto"><table><thead><tr><th>日付</th><th>店</th><th class="num">価格</th><th class="num">数量</th><th class="num">実質単価</th><th>メモ</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${moreBtn}${chart}</div></div>`;
    }).join('') : `<p class="muted">価格の記録がありません。「＋価格を記録」から追加してください。</p>`;
    $$('#priceList [data-pltoggle]').forEach(h => h.addEventListener('click', e => { if (e.target.closest('[data-pllink]')) return; const it = h.dataset.pltoggle; if (priceOpen.has(it)) priceOpen.delete(it); else priceOpen.add(it); renderPrice(); }));
    $$('#priceList [data-plmore]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const it = b.dataset.plmore; if (priceShowAll.has(it)) priceShowAll.delete(it); else priceShowAll.add(it); renderPrice(); }));
    $$('#priceList [data-pllink]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); gotoListWithKeyword(b.dataset.pllink); }));
    $$('#priceList [data-plrange]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const [it, rg] = b.dataset.plrange.split('|'); priceRange[it] = rg; renderPrice(); }));
    $$('#priceList [data-pledit]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openPriceModal(b.dataset.pledit); }));
    $$('#priceList [data-pldel]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (!confirm('削除しますか？')) return; state.priceLogs = state.priceLogs.filter(p => p.id !== b.dataset.pldel); persist(); renderPrice(); toast('削除しました'); }));
  }
  function drawPriceChart(item, range) {
    const ser = M.priceSeries(state, item, 3); let pts = ser.points; if (pts.length < 2) return '';
    const full = pts.length; if (range === '6' && pts.length > 6) pts = pts.slice(-6);
    const W = 560, H = 150, padL = 44, padR = 10, padT = 12, padB = 22; const vals = pts.map(p => p.value).concat(pts.map(p => p.ma)); const min = Math.min(...vals), max = Math.max(...vals); const rng = (max - min) || 1; const iw = W - padL - padR, ih = H - padT - padB;
    const x = i => padL + (pts.length === 1 ? iw / 2 : i / (pts.length - 1) * iw); const y = v => padT + (1 - (v - min) / rng) * ih;
    const linePath = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' '); const maPath = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.ma).toFixed(1)).join(' ');
    let grid = '', dots = '', xax = ''; for (let g = 0; g <= 2; g++) { const vv = min + rng * g / 2; const yy = y(vv); grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--line)" stroke-dasharray="3 3"/><text class="pc-ax" x="2" y="${yy + 3}">${Math.round(vv)}</text>`; }
    pts.forEach((p, i) => { dots += `<circle class="pc-dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3"><title>${p.date} ${esc(p.store)} ${Math.round(p.value * 100) / 100} ${ser.label}</title></circle>`; if (i === 0 || i === pts.length - 1 || pts.length <= 6) xax += `<text class="pc-ax" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${p.date.slice(5)}</text>`; });
    const rangeBtns = full > 6 ? `<span class="pc-range"><button class="${range === '6' ? 'active' : ''}" data-plrange="${esc(item)}|6">直近6</button><button class="${range === 'all' ? 'active' : ''}" data-plrange="${esc(item)}|all">全期間</button></span>` : '';
    return `<div class="pl-chart"><svg viewBox="0 0 ${W} ${H}">${grid}<path class="pc-ma" d="${maPath}"/><path class="pc-line" d="${linePath}"/>${dots}${xax}</svg><div class="pc-legend"><span><span class="pc-sw" style="background:var(--accent)"></span>実質単価 (${esc(ser.label)})</span><span><span class="pc-sw" style="background:var(--warn)"></span>移動平均(3)</span>${rangeBtns}</div></div>`;
  }
  function fmtNorm(n) { return (Math.round(n.value * 100) / 100).toLocaleString('ja-JP') + ' ' + n.label; }
  function openPriceModal(id) { const editing = id ? state.priceLogs.find(p => p.id === id) : null; const e = editing || { id: 'pl_' + Math.random().toString(36).slice(2, 8), item: '', date: M.todayStr(), store: '', branch: '', price: 0, qty: 0, unit: '総額', note: '' }; $('#modal').innerHTML = `<h3>${editing ? '価格を編集' : '価格を記録'}</h3><div class="field"><label>品目</label><input id="pl_item" list="dl-item" value="${esc(e.item)}" placeholder="例: 卵(10個) / 牛乳 / 鶏むね肉"></div><div class="row"><div class="field"><label>日付</label><input type="date" id="pl_date" value="${e.date}"></div><div class="field" style="flex:2"><label>店名</label><input id="pl_store" list="dl-store" value="${esc(e.store)}"></div><div class="field"><label>支店</label><input id="pl_branch" list="dl-branch" value="${esc(e.branch)}"></div></div><div class="row"><div class="field"><label>価格</label><input type="number" id="pl_price" value="${e.price || ''}"></div><div class="field"><label>数量</label><input type="number" id="pl_qty" value="${e.qty || ''}"></div><div class="field"><label>単位</label><select id="pl_unit">${PRICE_UNITS.map(u => `<option ${u === e.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div><div class="acc-sub" id="pl_preview" style="margin-bottom:8px"></div><div class="field"><label>メモ</label><input id="pl_note" value="${esc(e.note || '')}"></div><div class="actions"><button class="btn ghost" id="pl_cancel">キャンセル</button><button class="btn" id="pl_ok">保存</button></div>`; const upd = () => { const n = M.normalizedUnitPrice({ price: +$('#pl_price').value, qty: +$('#pl_qty').value, unit: $('#pl_unit').value }); $('#pl_preview').textContent = n ? '実質単価 ≈ ' + fmtNorm(n) : '数量を入れると実質単価を計算します'; }; ['#pl_price', '#pl_qty', '#pl_unit'].forEach(s => $(s).addEventListener('input', upd)); upd(); $('#pl_cancel').addEventListener('click', closeModal); $('#pl_ok').addEventListener('click', () => { const item = $('#pl_item').value.trim(); if (!item) return toast('品目を入れてください'); const price = +$('#pl_price').value; if (!price) return toast('価格を入れてください'); const data = { item, date: $('#pl_date').value, store: $('#pl_store').value, branch: $('#pl_branch').value, price, qty: +$('#pl_qty').value || 0, unit: $('#pl_unit').value, note: $('#pl_note').value }; if (editing) Object.assign(editing, data); else { M.addPriceLog(state, data); priceOpen.add(item); } persist(); refreshDatalists(); closeModal(); renderPrice(); toast('保存しました ✓'); }); showModal(); }

  /* ============ ナビ ============ */
  const TABS = ['entry', 'list', 'drill', 'budget', 'goals', 'wishlist', 'price', 'accounts', 'cards', 'report', 'settings'];
  const TAB_LABEL = { entry: '入力', list: '取引一覧', drill: '分析', budget: '予算', goals: '積立', wishlist: 'ほしいもの', price: '価格比較', accounts: '残高・口座', cards: 'カード請求', report: 'レポート', settings: '設定' };
  const BOTTOM_TABS = ['entry', 'list', 'drill', 'budget'];
  function renderDrawer() {
    const groups = [
      ['記録', [['entry', '✎'], ['list', '☰']]],
      ['分析', [['drill', '◔'], ['report', '▤'], ['budget', '◈'], ['goals', '◆']]],
      ['リスト', [['wishlist', '♡'], ['price', '⇅']]],
      ['口座', [['accounts', '▦'], ['cards', '▣']]],
      ['その他', [['settings', '⚙']]],
    ];
    $('#drawerBody').innerHTML = groups.map(([sec, items]) => `<div class="drawer-sec">${sec}</div>` + items.map(([t, ic]) => `<button class="drawer-item" data-tab="${t}"><span class="drawer-ic">${ic}</span>${TAB_LABEL[t]}</button>`).join('')).join('');
    $$('#drawerBody [data-tab]').forEach(b => b.addEventListener('click', () => { switchTab(b.dataset.tab); closeDrawer(); }));
  }
  function openDrawer() { renderDrawerActive(); $('#drawer').classList.add('show'); $('#drawerBg').classList.add('show'); }
  function closeDrawer() { $('#drawer').classList.remove('show'); $('#drawerBg').classList.remove('show'); }
  function renderDrawerActive() { $$('#drawerBody [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === curTab)); }
  let curTab = 'entry';
  function renderNav(name) {
    curTab = name;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('#bottomNav button').forEach(b => { if (b.dataset.tab) b.classList.toggle('active', b.dataset.tab === name); else if (b.dataset.menu) b.classList.toggle('active', !BOTTOM_TABS.includes(name)); });
    renderDrawerActive();
    const ct = $('#curTabName'); if (ct) ct.textContent = TAB_LABEL[name] || '';
  }
  function switchTab(name) {
    TABS.forEach(t => { const el = $('#tab-' + t); if (el) el.hidden = (t !== name); });
    renderNav(name);
    if (name === 'list') { if (!$('#fltYm').dataset.init) { $('#fltYm').value = currentYM(); $('#fltYm').dataset.init = '1'; } renderList(); }
    else if (name === 'drill') renderDrill();
    else if (name === 'budget') renderBudget();
    else if (name === 'goals') renderGoals();
    else if (name === 'wishlist') renderWishlist();
    else if (name === 'price') renderPrice();
    else if (name === 'accounts') renderAccounts();
    else if (name === 'cards') renderCards();
    else if (name === 'report') renderReport();
    else if (name === 'settings') renderSettings();
    else renderEntry();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function renderAll() { renderEntry(); renderList(); renderDrill(); renderBudget(); renderGoals(); renderWishlist(); renderPrice(); renderAccounts(); renderCards(); renderReport(); renderSettings(); }

  function bind() {
    $('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });
    const st=$('#settingsSubtabs'); if(st)st.addEventListener('click', e => { const b=e.target.closest('button[data-setting]'); if(!b)return; settingsSection=b.dataset.setting; renderSettingsTabs(); renderThemeSettings(); });
    $('#bottomNav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.tab) switchTab(b.dataset.tab); else if (b.dataset.menu) openDrawer(); });
    $('#hamburger').addEventListener('click', openDrawer);
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBg').addEventListener('click', closeDrawer);
    $('#typebar').addEventListener('click', e => { if (e.target.dataset.type) { ui.type = e.target.dataset.type; renderEntry(); } });
    $('#ym').addEventListener('change', onMonthChange); $('#ymPrev').addEventListener('click', () => shiftMonth(-1)); $('#ymNext').addEventListener('click', () => shiftMonth(1)); $('#ymToday').addEventListener('click', () => { $('#ym').value = M.curYM(); onMonthChange(); });
    ['#fltYm', '#fltCat', '#fltKind', '#fltText', '#fltSort'].forEach(s => { const e=$(s); if(e)e.addEventListener('input', renderList); });
    $('#fltClear').addEventListener('click', () => { $('#fltYm').value = ''; $('#fltCat').value = ''; $('#fltKind').value = ''; $('#fltText').value = ''; if($('#fltSort')) $('#fltSort').value = 'date_desc'; renderList(); });
    $('#chkAll').addEventListener('change', e => { const rows = filteredRows(); if (e.target.checked) rows.forEach(r => selected.add(r.id)); else rows.forEach(r => selected.delete(r.id)); renderList(); });
    $('#drillKind').addEventListener('change', e => { drill.kind = e.target.value; drill.parts = []; drill.leaf = null; renderDrill(); });
    ['#drillRange', '#drillFrom', '#drillTo'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('input', () => { drill.parts = []; drill.leaf = null; renderDrill(); }); });
    $('#addAcc').addEventListener('click', () => openAccountModal(null)); const mergeAcc = $('#mergeAcc'); if (mergeAcc) mergeAcc.addEventListener('click', openAccountMergeModal); $('#addRec').addEventListener('click', () => openRecModal(null));
    $('#addBudget').addEventListener('click', () => openBudgetModal(null)); $('#addGoal').addEventListener('click', () => openGoalModal(null));
    $('#addTpl').addEventListener('click', () => openTplModal(null));
    $('#addReading').addEventListener('click', () => openReadingModal(null));
    $('#budRollover').addEventListener('change', e => { state.budgetRollover = e.target.checked; persist(); renderBudget(); renderDrill(); toast(e.target.checked ? '繰越をONにしました' : '繰越をOFFにしました'); });
    $('#addWish').addEventListener('click', () => openWishModal(null)); $('#addPrice').addEventListener('click', () => openPriceModal(null));
    $('#simSurplus').addEventListener('input', e => { const v = e.target.value.trim(); simSurplus = v === '' ? null : +v; renderGoals(); });
    $('#simUseAvg').addEventListener('click', () => { simSurplus = null; renderGoals(); toast('直近平均を使用'); });
    $('#catKind').addEventListener('change', renderCatTree); $('#addCat').addEventListener('click', addCategory);
    const renameCatBtn=$('#renameCat'); if(renameCatBtn)renameCatBtn.addEventListener('click', openCategoryRenameModal); const delCatBtn=$('#deleteUnusedCat'); if(delCatBtn)delCatBtn.addEventListener('click', openCategoryDeleteModal);
    $('#exportBtn').addEventListener('click', exportJSON); $('#importBtn').addEventListener('click', () => $('#importFile').click()); $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
    $('#exportCsv').addEventListener('click', exportCSV); $('#importCsv').addEventListener('click', () => $('#csvFile').click()); $('#csvFile').addEventListener('change', e => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = ''; });
const xlBtn=$('#importExcel'); if(xlBtn)xlBtn.addEventListener('click',()=>$('#excelFile').click()); const xlFile=$('#excelFile'); if(xlFile)xlFile.addEventListener('change',e=>{if(e.target.files[0])importExcel(e.target.files[0]); e.target.value='';});
    $('#loadDummy').addEventListener('click', () => { if (confirm('現在のデータをダミーデータで置き換えます。よろしいですか？')) { state = M.makeDummy(); selected.clear(); persist(); refreshDatalists(); renderAll(); switchTab('entry'); updateGlobalNotice(); toast('ダミーデータを投入しました'); } });
    $('#resetBtn').addEventListener('click', () => { if (confirm('全データを初期化します。よろしいですか？')) { state = M.initialState(); selected.clear(); persist(); refreshDatalists(); renderAll(); switchTab('entry'); updateGlobalNotice(); toast('初期化しました'); } });
    $('#modalBg').addEventListener('click', e => { if (e.target.id === 'modalBg') closeModal(); });
  }
  function boot() { $('#ym').value = M.curYM(); bind(); renderDrawer(); refreshDatalists(); switchTab('entry'); updateGlobalNotice(); persist(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
