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
    ui.editId = null; ui.editNextId = null; ui.editPrevId = null; ui.editMove = null;
    ui.exp = { debits:[{path:'',amt:'',ratio:''}],credits:[{accId:'',amt:''}],detail:false,total:'',ratioMode:false,earnedPointAccId:'',earnedPoints:'',cardCycleYM:'' };
    ui._store = ''; ui._branch = ''; ui._memo = ''; ui._date = ui._date || M.todayStr();
    ui._amt = ''; ui._catPath = ''; ui._accId = ''; ui._fromId = ''; ui._toId = '';
    ui._prepaid = null; ui._goods = null; ui._paymentTouched = false; ui._paymentAutoStore = '';
  }
  ui._date = M.todayStr(); ui.type = 'expense'; resetEntryState();

  let drill = { kind: 'net', parts: [], leaf: null };   // 既定=収支(net)
  let selected = new Set();
let listCategoryFilter = null;
  let simSurplus = null;
  let wishFilter = { tag: null, status: 'active' };
  let priceOpen = new Set(), priceShowAll = new Set(), priceRange = {};
  const PALETTE = ['#4f9dff', '#38c793', '#ffb454', '#ff6b6b', '#a78bfa', '#22d3ee', '#f472b6', '#84cc16', '#fb923c', '#94a3b8', '#eab308', '#2dd4bf'];
  function categoryColor(path){ const custom=state.meta&&state.meta.categoryColors&&state.meta.categoryColors[path]; if(custom)return custom; let h=2166136261; for(const ch of String(path||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return PALETTE[(h>>>0)%PALETTE.length]; }
  function ensureCategoryColors(){ state.meta=state.meta||{}; state.meta.categoryColors=state.meta.categoryColors||{}; return state.meta.categoryColors; }
  function hexToHsl(hex){ const n=parseInt(String(hex).replace('#',''),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0;const l=(max+min)/2,d=max-min;if(d){s=l>.5?d/(2-max-min):d/(max+min);if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}return {h:Math.round(h),s:Math.round(s*100),l:Math.round(l*100)}; }
  function hslToHex(h,s,l){s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join(''); }
  const CATEGORY_COLOR_PRESETS = {
    distinct: { label:'判別重視', colors:['#4F9DFF','#38C793','#FFB454','#FF6B6B','#A78BFA','#22D3EE','#F472B6','#84CC16','#FB923C','#94A3B8','#EAB308','#2DD4BF','#C084FC','#60A5FA','#F87171','#34D399'] },
    tableau: { label:'Tableau系', colors:['#4E79A7','#F28E2B','#E15759','#76B7B2','#59A14F','#EDC948','#B07AA1','#FF9DA7','#9C755F','#BAB0AC','#2F6B8A','#D37225','#A63D40','#4C8C88','#3D7A38','#B59A25'] },
    soft: { label:'落ち着いた色', colors:['#6B8FD6','#62B6A6','#D9A66A','#D97979','#9A83C7','#5FAFC4','#C77DA8','#8FAB5A','#C88A5A','#8794A5','#C3A640','#5CA99D','#AA75BD','#749DC2','#C47777','#6CAF91'] }
  };
  function applyCategoryColorPreset(name){
    const preset=CATEGORY_COLOR_PRESETS[name]||CATEGORY_COLOR_PRESETS.distinct, colors=ensureCategoryColors(), pal=preset.colors;
    const assign=(kind,kindOffset)=>{ const pfx=kind==='income'?'inc':'exp', root=state.categories[kind]||{}; Object.keys(root).forEach((top,ti)=>{ colors[pfx+'>'+top]=pal[(ti+kindOffset)%pal.length]; const mids=root[top]||{}; Object.keys(mids).forEach((mid,mi)=>{ colors[pfx+'>'+top+'>'+mid]=pal[(mi+ti*5+3+kindOffset)%pal.length]; (mids[mid]||[]).forEach((leaf,li)=>{ colors[pfx+'>'+top+'>'+mid+'>'+leaf]=pal[(li+mi*7+ti*3+6+kindOffset)%pal.length]; }); }); }); };
    assign('expense',0); assign('income',5); state.meta.categoryColorPreset=name; persist(); renderCatTree(); renderDrill(); renderReport();
  }
  function openCategoryColorPresetModal(){ const tops=categoryRows('expense').filter(r=>r.level===0); const cards=Object.entries(CATEGORY_COLOR_PRESETS).map(([key,p])=>`<button class="category-preset-card" data-preset="${key}"><b>${esc(p.label)}</b><span class="category-preset-swatches">${tops.map((t,i)=>`<i style="background:${p.colors[i%p.colors.length]}" title="${esc(t.name)} ${p.colors[i%p.colors.length]}"></i>`).join('')}</span><code>${p.colors.slice(0,Math.min(tops.length,8)).join(' ')}</code></button>`).join(''); $('#modal').innerHTML=`<h3>カテゴリ色プリセット</h3><p class="hint">大カテゴリ同士が重複しない配色を一括適用します。同じ親に属する中カテゴリ同士、小カテゴリ同士も異なる色系統へ割り当てます。適用後も各カテゴリの「色」から個別調整できます。</p><div class="category-preset-list">${cards}</div><div class="actions"><button class="btn ghost" id="cp_cancel">キャンセル</button></div>`; $$('.category-preset-card',$('#modal')).forEach(b=>b.addEventListener('click',()=>{if(!confirm(`「${CATEGORY_COLOR_PRESETS[b.dataset.preset].label}」を全カテゴリへ適用しますか？`))return;applyCategoryColorPreset(b.dataset.preset);closeModal();toast('カテゴリ色プリセットを適用しました ✓');})); $('#cp_cancel').addEventListener('click',closeModal); showModal(); }
  function openCategoryColorModal(path,label){ const colors=ensureCategoryColors(), current=categoryColor(path), hsl=hexToHsl(current); $('#modal').innerHTML=`<h3>カテゴリ色：${esc(label)}</h3><p class="hint">棒グラフ、円グラフ、凡例で共通使用します。親子カテゴリはそれぞれ個別に設定できます。</p><div class="category-color-preview" id="cc_preview"><span></span><b>${esc(label)}</b><code id="cc_hex_text">${current}</code></div><div class="field"><label>カラーピッカー</label><input type="color" id="cc_hex" value="${current}"></div><div class="field"><label>色相 <span id="cc_h_v">${hsl.h}</span>°</label><input type="range" id="cc_h" min="0" max="359" value="${hsl.h}"></div><div class="field"><label>彩度 <span id="cc_s_v">${hsl.s}</span>%</label><input type="range" id="cc_s" min="0" max="100" value="${hsl.s}"></div><div class="field"><label>明るさ <span id="cc_l_v">${hsl.l}</span>%</label><input type="range" id="cc_l" min="15" max="85" value="${hsl.l}"></div><div class="actions"><button class="btn ghost" id="cc_reset">自動色に戻す</button><button class="btn ghost" id="cc_cancel">キャンセル</button><button class="btn" id="cc_save">保存</button></div>`; const update=(source)=>{let color;if(source==='hex'){const z=hexToHsl($('#cc_hex').value);$('#cc_h').value=z.h;$('#cc_s').value=z.s;$('#cc_l').value=z.l;}color=hslToHex(+$('#cc_h').value,+$('#cc_s').value,+$('#cc_l').value);$('#cc_hex').value=color;$('#cc_h_v').textContent=$('#cc_h').value;$('#cc_s_v').textContent=$('#cc_s').value;$('#cc_l_v').textContent=$('#cc_l').value;$('#cc_hex_text').textContent=color;$('#cc_preview span').style.background=color;}; $('#cc_hex').addEventListener('input',()=>update('hex')); ['#cc_h','#cc_s','#cc_l'].forEach(id=>$(id).addEventListener('input',()=>update())); $('#cc_cancel').addEventListener('click',closeModal); $('#cc_reset').addEventListener('click',()=>{delete colors[path];persist();closeModal();renderCatTree();renderDrill();renderReport();toast('自動色に戻しました');}); $('#cc_save').addEventListener('click',()=>{colors[path]=$('#cc_hex').value.toLowerCase();persist();closeModal();renderCatTree();renderDrill();renderReport();toast('カテゴリ色を保存しました ✓');}); update(); showModal(); }

  function categoryPath(kind,parts){ return (kind==='income'?'inc>':'exp>')+(parts||[]).join('>'); }

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
      const opts = Array.from(sel.options).map(o => ({ value: o.value, label: o.textContent })).filter(o => o.value || o.label);
      const wrap = el('div', { class: 'catcombo' }); sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.classList.add('cc-native');
      const input = el('input', { class: 'cc-input', type: 'text', placeholder: 'カテゴリを検索…' });
      const disp = o => o ? (isNarrow() ? catLeaf(o.label) : o.label) : '';
      const cur = opts.find(o => o.value === sel.value); input.value = disp(cur);
      const pop = el('div', { class: 'ac-pop' }); wrap.appendChild(input); wrap.appendChild(pop);
      let items = [], active = -1, composing = false, autoTimer = null; input._yomiParts = []; input._curYomi = '';
      const readingFor = o => ((state.readings && (state.readings[o.value] || state.readings[o.label] || state.readings[catLeaf(o.label)])) || '');
      const close = () => { pop.classList.remove('show'); active = -1; };
      const rememberReading = o => { const rd = (input._yomiParts || []).join(''); if (rd && o && o.value) { state.readings = state.readings || {}; state.readings[o.value] = rd; state.readings[o.label] = rd; state.readings[catLeaf(o.label)] = rd; persist(); } input._yomiParts = []; input._curYomi = ''; };
      const commit = o => { if (!o) return; sel.value = o.value; input.value = disp(o); rememberReading(o); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); };
      const render = () => {
        const q = input.value.trim(); const qn = M.normReading(q);
        items = !q ? opts.slice(0, 60) : opts.filter(o => o.label.includes(q) || M.normReading(o.label).includes(qn) || M.normReading(readingFor(o)).includes(qn));
        items = items.slice(0, 60);
        clearTimeout(autoTimer);
        if (!items.length) { close(); return; }
        pop.innerHTML = items.map((o, i) => { const h = catHead(o.label), lf = catLeaf(o.label); const rd = readingFor(o); return `<div class="ac-item ${i === active ? 'active' : ''}" data-i="${i}">${h ? `<div class="cc-head">${esc(h)}</div>` : ''}<div class="cc-leaf">${esc(lf)}</div>${rd ? `<div class="cc-head">${esc(rd)}</div>` : ''}</div>`; }).join('');
        pop.classList.add('show');
        $$('.ac-item', pop).forEach(it => it.addEventListener('mousedown', e => { e.preventDefault(); commit(items[+it.dataset.i]); }));
        if (q && !composing && items.length === 1 && sel.value !== items[0].value) autoTimer = setTimeout(() => commit(items[0]), 120);
      };
      input.addEventListener('compositionstart', () => composing = true);
      input.addEventListener('compositionupdate', e => { if (e.data && /^[぀-ゟーｰ\u30fc\s]+$/.test(e.data)) input._curYomi = e.data; });
      input.addEventListener('compositionend', () => { composing = false; if (input._curYomi) { input._yomiParts.push(input._curYomi); input._curYomi = ''; } render(); });
      input.addEventListener('input', () => { if (!composing) render(); });
      input.addEventListener('focus', () => { input.select && input.select(); render(); });
      input.addEventListener('blur', () => setTimeout(() => { const c = opts.find(o => o.value === sel.value); if (c) input.value = disp(c); close(); }, 150));
      input.addEventListener('keydown', e => { if (!pop.classList.contains('show')) return; if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); } else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); commit(items[active]); } } else if (e.key === 'Escape') close(); });
    });
  }
  function enhanceAccountSelects(root) {
    $$('select.accsel', root || document).forEach(sel => {
      if (sel.dataset.accenh) return; sel.dataset.accenh = '1';
      const opts = Array.from(sel.options).map(o => ({ value: o.value, label: o.textContent })).filter(o => o.value);
      const wrap = el('div', { class: 'catcombo acccombo' }); sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.classList.add('cc-native');
      const input = el('input', { class: 'cc-input', type: 'text', placeholder: '支払手段を検索…' });
      const pop = el('div', { class: 'ac-pop' }); wrap.appendChild(input); wrap.appendChild(pop);
      const disp = o => o ? o.label : '';
      const cur = opts.find(o => o.value === sel.value); input.value = disp(cur);
      let items = [], active = -1;
      const close = () => { pop.classList.remove('show'); active = -1; };
      const commit = o => { if (!o) return; sel.value = o.value; input.value = disp(o); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); };
      const render = () => { const q=input.value.trim(), qn=M.normReading(q); items = !q ? opts.slice(0,80) : opts.filter(o => o.label.includes(q) || M.normReading(o.label).includes(qn)).slice(0,80); if(!items.length){close();return;} pop.innerHTML = items.map((o,i)=>`<div class="ac-item ${i===active?'active':''}" data-i="${i}">${esc(o.label)}</div>`).join(''); pop.classList.add('show'); $$('.ac-item',pop).forEach(it=>it.addEventListener('mousedown',e=>{e.preventDefault();commit(items[+it.dataset.i]);})); if(q && items.length===1 && sel.value!==items[0].value) setTimeout(()=>commit(items[0]),120); };
      input.addEventListener('input', render); input.addEventListener('focus',()=>{input.select&&input.select();render();}); input.addEventListener('blur',()=>setTimeout(()=>{const c=opts.find(o=>o.value===sel.value); if(c)input.value=disp(c); close();},150)); input.addEventListener('keydown',e=>{ if(!pop.classList.contains('show'))return; if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(items.length-1,active+1);render();} else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);render();} else if(e.key==='Enter'&&active>=0){e.preventDefault();commit(items[active]);} else if(e.key==='Escape')close(); });
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
  const UNMANAGED_POINT_ID = '__unmanaged_point__';
  const UNMANAGED_POINT_REF='adj:unmanaged_point';
  const POINT_EARNED_REF='adj:point_earned';
  const POINT_BALANCE_REF='adj:point_balance';
  function isUnmanagedPoint(id) { return id === UNMANAGED_POINT_ID; }
  function isUsageRewardAccount(id) { const a = accById(id); const sub = a && M.ACCOUNT_SUBTYPES[a.subtype]; return !!(sub && sub.manage === 'usage'); }
  function accName(id) { if (isUnmanagedPoint(id)) return '管理外ポイント控除'; const a = accById(id); return a ? a.name : id; }
  function refLabel(ref) { if(ref===POINT_EARNED_REF)return 'ポイント獲得（分析対象外）'; if(ref===POINT_BALANCE_REF)return 'ポイント残高調整（分析対象外）'; if (ref === UNMANAGED_POINT_REF) return '管理外ポイント控除'; if (ref.startsWith('acc:')) return accName(ref.slice(4)); if (ref.startsWith('cat:')) return ref.slice(4).replace(/^exp>|^inc>/, '').split('>').join(' › '); return ref; }
  function paymentOptions(selected, filter) { const normal=accountOptions(filter,selected); return normal + `<option value="${UNMANAGED_POINT_ID}" ${selected===UNMANAGED_POINT_ID?'selected':''}>管理外ポイント控除（旧方式・残高管理なし）</option>`; }
  function paymentCredit(c) { return isUnmanagedPoint(c.accId) ? { ref:UNMANAGED_POINT_REF, amount:creditPayAmount(c) } : { accId:c.accId, amount:creditPayAmount(c), qty:c.qty }; }
  function preferredPaymentForStore(store) { if (!store) return ''; const totals = {}; state.transactions.forEach(t => { if (t.kind !== 'expense' || t.store !== store) return; t.lines.forEach(l => { if (l.amount >= 0) return; const id=l.ref===UNMANAGED_POINT_REF?UNMANAGED_POINT_ID:(l.ref.startsWith('acc:')?l.ref.slice(4):''); if(!id)return; totals[id]=(totals[id]||0)+(-l.amount); }); }); return Object.entries(totals).filter(([id])=>isUnmanagedPoint(id)||!!accById(id)).sort((x,y)=>y[1]-x[1])[0]?.[0]||''; }
  function applyPreferredPaymentForStore(store) { if (ui.editId || ui.type !== 'expense' || ui._paymentTouched || !store || ui._paymentAutoStore===store) return; const id=preferredPaymentForStore(store); if(!id)return; ui._paymentAutoStore=store; const prev=ui.exp.credits[0]||{}; ui.exp.credits=[Object.assign({},prev,{accId:id})]; renderCreditsExp(); recalcExpense(); }
  function accountOptions(filter, selected) { return accountsBy(a => !filter || filter(a)).map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}（${M.ACCOUNT_SUBTYPES[a.subtype].label}）</option>`).join(''); }
  function categoryOptions(kind, selected) { return M.flattenCategories(state.categories, kind).map(c => `<option value="${c.path}" ${c.path === selected ? 'selected' : ''}>${c.label}</option>`).join(''); }
function ensureUncategorizedCategory() { const root = state.categories.expense || (state.categories.expense = {}); root['その他'] = root['その他'] || {}; root['その他']['未分類'] = root['その他']['未分類'] || []; return 'exp>その他>未分類'; }
  function refreshDatalists() { const stores = new Set(), branches = new Set(), items = new Set(); state.transactions.forEach(t => { if (t.store) stores.add(t.store); if (t.branch) branches.add(t.branch); }); (state.priceLogs || []).forEach(p => { if (p.item) items.add(p.item); if (p.store) stores.add(p.store); }); $('#dl-store').innerHTML = [...stores].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-branch').innerHTML = [...branches].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-item').innerHTML = [...items].map(s => `<option value="${esc(s)}">`).join(''); $('#dl-top').innerHTML = Object.keys(state.categories.expense).map(s => `<option value="${esc(s)}">`).join(''); }

  function currentYM() { return $('#ym').value || M.curYM(); }
  function shiftMonth(delta) { const [y, m] = currentYM().split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); $('#ym').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); onMonthChange(); }
  function onMonthChange() { renderReport(); renderDrill(); renderBudget(); renderGoals(); if (!$('#tab-list').hidden) { $('#fltYm').value = currentYM(); renderList(); } }

