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

