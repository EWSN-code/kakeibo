  /* ============ ナビ ============ */
  const TABS = ['entry', 'list', 'drill', 'budget', 'wishlist', 'price', 'accounts', 'cards', 'report', 'settings'];
  const TAB_LABEL = { entry: '入力', list: '取引一覧', drill: '分析', budget: '予算・積立', wishlist: 'ほしいもの', price: '価格比較', accounts: '残高・口座', cards: 'カード請求', report: 'レポート', settings: '設定' };
  const BOTTOM_TABS = ['entry', 'list', 'drill', 'budget'];
  function renderDrawer() {
    const groups = [
      ['記録', [['entry', '✎'], ['list', '☰']]],
      ['分析', [['drill', '◔'], ['report', '▤'], ['budget', '◈']]],
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
    else if (name === 'wishlist') renderWishlist();
    else if (name === 'price') renderPrice();
    else if (name === 'accounts') renderAccounts();
    else if (name === 'cards') renderCards();
    else if (name === 'report') renderReport();
    else if (name === 'settings') renderSettings();
    else renderEntry();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function renderAll() { renderEntry(); renderList(); renderDrill(); renderBudget(); renderWishlist(); renderPrice(); renderAccounts(); renderCards(); renderReport(); renderSettings(); }

  function bind() {
    $('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });
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
