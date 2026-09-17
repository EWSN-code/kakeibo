/* =====================================================================
 * ui-refresh.js — progressive UI enhancements for v1.8.0-ui.1
 *
 * This file intentionally sits outside app.js.  The existing accounting and
 * editing logic stays untouched; this layer only reorganises presentation and
 * adds a consolidated trend view using the public Model/StorageAdapter APIs.
 * ===================================================================== */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const yen = v => window.Model && window.Model.yen ? window.Model.yen(Number(v) || 0) : `¥${Math.round(Number(v) || 0).toLocaleString('ja-JP')}`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  let mode = 'net';
  let analysisObserver = null;

  function getState() {
    try {
      return window.StorageAdapter && typeof window.StorageAdapter.load === 'function'
        ? window.StorageAdapter.load()
        : null;
    } catch (_) {
      return null;
    }
  }

  function signedYen(v) {
    const n = Math.round(Number(v) || 0);
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${yen(Math.abs(n))}`;
  }

  function setActiveButton(next) {
    const nav = $('#uiAnalysisSwitch');
    if (!nav) return;
    nav.querySelectorAll('button[data-mode]').forEach(btn => {
      const on = btn.dataset.mode === next;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function setPeriodVisibility(visible) {
    const range = $('#drillRange');
    const field = range && range.closest('.field');
    if (field) field.style.display = visible ? '' : 'none';
    const custom = $('#drillCustom');
    if (custom) {
      if (!visible) custom.style.display = 'none';
      else custom.style.display = range && range.value === 'custom' ? '' : 'none';
    }
  }

  function setMode(next, opts) {
    opts = opts || {};
    const kind = $('#drillKind');
    const body = $('#drillBody');
    const pane = $('#uiTrendPane');
    if (!kind || !body || !pane) return;

    mode = next;
    setActiveButton(next);

    if (next === 'trend') {
      body.hidden = true;
      pane.hidden = false;
      setPeriodVisibility(false);
      renderTrend();
      return;
    }

    pane.hidden = true;
    body.hidden = false;
    setPeriodVisibility(true);

    if (kind.value !== next) {
      kind.value = next;
      if (!opts.silent) kind.dispatchEvent(new Event('change', { bubbles:true }));
    }
  }

  function renderTrend() {
    const pane = $('#uiTrendPane');
    const M = window.Model;
    const state = getState();
    const ym = $('#ym') && $('#ym').value;
    if (!pane) return;

    if (!M || !state || !ym || !M.monthlySummary || !M.trailingMonths) {
      pane.innerHTML = '<p class="muted">データを読み込んでいます…</p>';
      return;
    }

    const months = M.trailingMonths(ym, 6).map(m => ({ ym:m, ...M.monthlySummary(state, m) }));
    const current = months[months.length - 1] || { income:0, expense:0, net:0 };
    const previous = months[months.length - 2] || { income:0, expense:0, net:0 };
    const currentNet = Number(current.net != null ? current.net : current.income - current.expense) || 0;
    const prevNet = Number(previous.net != null ? previous.net : previous.income - previous.expense) || 0;
    const diff = currentNet - prevNet;
    const savings = current.income > 0 ? Math.round(currentNet / current.income * 100) : 0;

    const hero = `
      <div class="ui-trend-hero">
        <div class="ui-trend-metric primary">
          <div class="k">${esc(ym)} の収支</div>
          <div class="v ${currentNet >= 0 ? 'pos' : 'neg'}">${signedYen(currentNet)}</div>
          <div class="sub">前月差 ${signedYen(diff)}${current.income > 0 ? ` ・ 貯蓄率 ${savings}%` : ''}</div>
        </div>
        <div class="ui-trend-metric">
          <div class="k">収入</div>
          <div class="v pos">${yen(current.income)}</div>
          <div class="sub">今月</div>
        </div>
        <div class="ui-trend-metric">
          <div class="k">支出</div>
          <div class="v neg">${yen(current.expense)}</div>
          <div class="sub">今月</div>
        </div>
      </div>`;

    const chart = renderIncomeExpenseChart(months);
    const categories = M.expenseByTopCategory ? M.expenseByTopCategory(state, ym) : {};
    const catEntries = Object.entries(categories || {}).sort((a,b) => b[1] - a[1]);
    const catMax = Math.max(1, ...catEntries.map(([,v]) => Number(v) || 0));
    const catRows = catEntries.slice(0, 8).map(([name, amount]) => `
      <div class="ui-trend-row">
        <span class="name">${esc(name)}</span>
        <span class="track"><span style="width:${Math.max(2, Math.min(100, Number(amount) / catMax * 100))}%"></span></span>
        <span class="amount">${yen(amount)}</span>
      </div>`).join('') || '<p class="muted">この月の支出はありません。</p>';

    pane.innerHTML = hero + `
      <section class="ui-trend-section">
        <div class="ui-trend-section-head"><h4>収入・支出の推移</h4><span>選択月までの6か月</span></div>
        <div class="ui-trend-chart">${chart}</div>
        <div class="ui-trend-legend"><span class="inc"><i></i>収入</span><span class="exp"><i></i>支出</span></div>
      </section>
      <section class="ui-trend-section">
        <div class="ui-trend-section-head"><h4>今月の支出カテゴリ</h4><span>上位${Math.min(8, catEntries.length)}件</span></div>
        <div class="ui-trend-list">${catRows}</div>
      </section>`;
  }

  function renderIncomeExpenseChart(months) {
    const W = 720, H = 250, left = 48, right = 16, top = 18, bottom = 48;
    const innerW = W - left - right;
    const innerH = H - top - bottom;
    const max = Math.max(1, ...months.map(m => Math.max(Number(m.income) || 0, Number(m.expense) || 0)));
    const step = innerW / Math.max(1, months.length);
    const barW = Math.min(22, step * .24);
    let grid = '', bars = '', labels = '';

    for (let i = 0; i <= 2; i++) {
      const value = max * i / 2;
      const y = top + innerH - innerH * i / 2;
      grid += `<line class="ui-trend-grid" x1="${left}" y1="${y}" x2="${W-right}" y2="${y}"/>`;
      grid += `<text class="ui-trend-value" x="2" y="${y + 3}">${esc(compactYen(value))}</text>`;
    }

    months.forEach((m, i) => {
      const cx = left + step * i + step / 2;
      const ih = (Number(m.income) || 0) / max * innerH;
      const eh = (Number(m.expense) || 0) / max * innerH;
      const iy = top + innerH - ih;
      const ey = top + innerH - eh;
      bars += `<rect class="ui-trend-income" x="${cx-barW-2}" y="${iy}" width="${barW}" height="${ih}" rx="3"/>`;
      bars += `<rect class="ui-trend-expense" x="${cx+2}" y="${ey}" width="${barW}" height="${eh}" rx="3"/>`;
      const monthLabel = String(m.ym || '').slice(5).replace(/^0/, '') + '月';
      const net = Number(m.net != null ? m.net : (m.income || 0) - (m.expense || 0)) || 0;
      labels += `<text class="ui-trend-label" text-anchor="middle" x="${cx}" y="${H-25}">${esc(monthLabel)}</text>`;
      labels += `<text class="ui-trend-value" text-anchor="middle" x="${cx}" y="${H-9}" fill="${net >= 0 ? 'var(--accent2)' : 'var(--danger)'}">${esc(compactSignedYen(net))}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="6か月の収入と支出の推移">${grid}${bars}${labels}</svg>`;
  }

  function compactYen(v) {
    const n = Math.round(Number(v) || 0);
    if (Math.abs(n) >= 1000000) return `¥${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}M`;
    if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(n % 10000 ? 1 : 0)}万`;
    return `¥${n.toLocaleString('ja-JP')}`;
  }

  function compactSignedYen(v) {
    const n = Math.round(Number(v) || 0);
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return sign + compactYen(Math.abs(n));
  }

  function ensureAnalysisUI() {
    const tab = $('#tab-drill');
    const body = $('#drillBody');
    const kind = $('#drillKind');
    if (!tab || !body || !kind) return false;

    const kindField = kind.closest('.field');
    if (kindField) kindField.classList.add('ui-kind-field');

    let nav = $('#uiAnalysisSwitch');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'uiAnalysisSwitch';
      nav.className = 'ui-analysis-switch';
      nav.setAttribute('role', 'tablist');
      nav.setAttribute('aria-label', '分析表示');
      nav.innerHTML = [
        ['net','概要'], ['expense','支出'], ['income','収入'], ['trend','推移']
      ].map(([value,label]) => `<button type="button" role="tab" data-mode="${value}">${label}</button>`).join('');
      const title = tab.querySelector('.section-title');
      if (title) title.insertAdjacentElement('afterend', nav);
      else tab.prepend(nav);
      nav.addEventListener('click', e => {
        const btn = e.target.closest('button[data-mode]');
        if (btn) setMode(btn.dataset.mode);
      });
    }

    let pane = $('#uiTrendPane');
    if (!pane) {
      pane = document.createElement('div');
      pane.id = 'uiTrendPane';
      pane.className = 'ui-trend-pane';
      pane.hidden = true;
      body.insertAdjacentElement('afterend', pane);
    }

    if (!kind.dataset.uiRefreshBound) {
      kind.dataset.uiRefreshBound = '1';
      kind.addEventListener('change', () => {
        if (mode !== 'trend') {
          mode = kind.value || 'net';
          setActiveButton(mode);
        }
      });
    }

    if (!analysisObserver) {
      analysisObserver = new MutationObserver(() => {
        if (mode !== 'trend' && kind.value && kind.value !== mode) {
          mode = kind.value;
          setActiveButton(mode);
        }
      });
      analysisObserver.observe(body, { childList:true, subtree:false });
    }

    if (!nav.dataset.initialised) {
      nav.dataset.initialised = '1';
      mode = kind.value || 'net';
      setMode(mode, { silent:true });
    }
    return true;
  }

  function bindRefreshEvents() {
    const ym = $('#ym');
    if (ym && !ym.dataset.uiRefreshBound) {
      ym.dataset.uiRefreshBound = '1';
      ym.addEventListener('change', () => { if (mode === 'trend') requestAnimationFrame(renderTrend); });
    }

    const tab = $('#tab-drill');
    if (tab && !tab.dataset.uiRefreshObserved) {
      tab.dataset.uiRefreshObserved = '1';
      new MutationObserver(() => {
        if (!tab.hidden) {
          ensureAnalysisUI();
          if (mode === 'trend') requestAnimationFrame(renderTrend);
        }
      }).observe(tab, { attributes:true, attributeFilter:['hidden'] });
    }
  }

  function init() {
    ensureAnalysisUI();
    bindRefreshEvents();

    /* app.js is injected asynchronously by cloud.js. Retry briefly until its
     * DOM/event layer is ready; after that the attribute observer handles tab
     * changes without polling. */
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ready = ensureAnalysisUI();
      bindRefreshEvents();
      if ((ready && window.StorageAdapter && window.Model) || tries > 80) clearInterval(timer);
    }, 125);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
