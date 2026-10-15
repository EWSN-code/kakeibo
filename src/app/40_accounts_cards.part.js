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
    const sub = M.ACCOUNT_SUBTYPES[a.subtype]; const rows = accountFlowRows(id); if(sub.manage==='usage'){ const used=rows.filter(r=>r.amount<0); const total=used.reduce((sum,r)=>sum-r.amount,0); const body=used.map(r=>`<tr><td>${r.date}</td><td>${esc(r.store||'')}${r.branch?' <span class="muted">/ '+esc(r.branch)+'</span>':''}</td><td class="num">${yen(-r.amount)}</td><td><button class="btn ghost sm" data-jumpedit="${r.id}">編集</button></td></tr>`).join(''); $('#modal').innerHTML=`<h3>利用履歴：${esc(a.name)}</h3><div class="excel-mini"><span class="tag">${esc(sub.label)}</span><span class="tag">残高管理なし</span><span class="tag">累計利用 ${yen(total)}</span></div><div class="excel-tablewrap"><table><thead><tr><th>日付</th><th>店/メモ</th><th class="num">利用額</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="4" class="muted">利用履歴はありません</td></tr>'}</tbody></table></div><div class="actions"><button class="btn ghost" id="ad_close">閉じる</button></div>`; $('#ad_close').addEventListener('click',closeModal); $('[data-jumpedit]',$('#modal')).forEach(b=>b.addEventListener('click',()=>{const tid=b.dataset.jumpedit;closeModal();loadForEdit(tid);})); showModal(); return; } let running = a.opening || 0;
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

  function pointBalanceAtDate(accId,date,excludeId){ const acc=accById(accId); if(!acc)return 0; let bal=acc.opening||0; state.transactions.forEach(t=>{if(t.id===excludeId||t.date>date)return;t.lines.forEach(l=>{if(l.ref==='acc:'+accId)bal+=l.amount||0;});}); return bal; }
  function openPointBalanceModal(accId){ const acc=accById(accId); if(!acc||acc.subtype!=='point')return; const date=M.todayStr(); const cur=pointBalanceAtDate(accId,date); $('#modal').innerHTML=`<h3>ポイント残高を登録：${esc(acc.name)}</h3><p class="hint">任意日時点の実残高を登録します。帳簿との差額だけを残高調整として記録し、収入・支出分析には含めません。</p><div class="field"><label>残高確認日</label><input type="date" id="pb_date" value="${date}"></div><div class="field"><label>実際のポイント残高</label><input id="pb_balance" inputmode="decimal" value="${cur}"></div><div class="acc-sub" id="pb_hint"></div><div class="field"><label>メモ</label><input id="pb_memo" placeholder="例: アプリ残高を確認"></div><div class="actions"><button class="btn ghost" id="pb_cancel">キャンセル</button><button class="btn" id="pb_ok">残高を登録</button></div>`; const upd=()=>{const d=$('#pb_date').value,actual=evalYen($('#pb_balance').value),book=pointBalanceAtDate(accId,d);$('#pb_hint').textContent=`帳簿残高 ${yen(book)} → 実残高 ${yen(actual)} ・ 調整 ${yen(actual-book)}`;}; $('#pb_date').addEventListener('change',upd);$('#pb_balance').addEventListener('input',upd);$('#pb_cancel').addEventListener('click',closeModal);$('#pb_ok').addEventListener('click',()=>{const d=$('#pb_date').value,actual=evalYen($('#pb_balance').value);if(Number.isNaN(actual))return toast('残高を確認してください');const book=pointBalanceAtDate(accId,d),delta=actual-book;if(Math.abs(delta)<0.5){closeModal();return toast('調整はありません');}const lines=delta>0?[{ref:'acc:'+accId,amount:delta},{ref:POINT_BALANCE_REF,amount:-delta}]:[{ref:POINT_BALANCE_REF,amount:-delta},{ref:'acc:'+accId,amount:delta}];state.transactions.push({id:'t_'+Math.random().toString(36).slice(2,10),date:d,lines,store:'ポイント残高調整',branch:'',memo:$('#pb_memo').value||`${acc.name} 実残高 ${actual}`,kind:'point_balance_adjustment',meta:{pointBalance:{accId,actual,before:book,delta}}});persist();closeModal();renderAccounts();renderList();renderReport();renderDrill();toast('ポイント残高を調整しました ✓');});upd();showModal(); }
  function renderAccounts() {
    const usage = accountsBy(a => M.ACCOUNT_SUBTYPES[a.subtype].manage === 'usage'); const assets = accountsBy(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'asset' && a.subtype !== 'transit' && M.ACCOUNT_SUBTYPES[a.subtype].manage !== 'usage'); const liabs = accountsBy(a => M.ACCOUNT_SUBTYPES[a.subtype].kind === 'liability'); const maxAbs = Math.max(1, ...assets.map(a => Math.abs(M.accountBalance(state, a.id))));
    const accHtml = a => { const bal = M.accountBalance(state, a.id); const extra = a.subtype === 'voucher_goods' ? ` · 残${M.goodsQty(state, a.id)}枚` : ''; const w = Math.min(100, Math.abs(bal) / maxAbs * 100); return `<div class="acc-row"><div><div class="acc-name">${esc(a.name)}</div><div class="acc-sub">${M.ACCOUNT_SUBTYPES[a.subtype].label}${extra}</div><div class="bar"><span style="width:${w}%"></span></div></div><div class="num" style="font-weight:700">${yen(bal)}</div></div>`; };
    const totalAsset = assets.reduce((s, a) => s + M.accountBalance(state, a.id), 0); const totalLiab = liabs.reduce((s, a) => s + M.accountBalance(state, a.id), 0);
    $('#accList').innerHTML = `<div class="acc-sub" style="margin-bottom:4px">資産</div>` + assets.map(accHtml).join('') + (liabs.length ? `<div class="acc-sub" style="margin:10px 0 4px">負債</div>` + liabs.map(accHtml).join('') : ''); if(usage.length){ const usageHtml=usage.map(a=>{ const used=state.transactions.reduce((sum,t)=>sum+t.lines.filter(l=>l.ref==='acc:'+a.id&&l.amount<0).reduce((x,l)=>x-l.amount,0),0); return `<div class="acc-row"><div><div class="acc-name">${esc(a.name)}</div><div class="acc-sub">${M.ACCOUNT_SUBTYPES[a.subtype].label} ・ 残高管理なし</div></div><div class="num" style="font-weight:700">累計 ${yen(used)}</div></div>`; }).join(''); $('#accList').insertAdjacentHTML('beforeend',`<div class="acc-sub" style="margin:10px 0 4px">利用時認識の特典</div>${usageHtml}`); } $('#netWorth').textContent = `純資産 ${yen(totalAsset - totalLiab)}`;
    $('#accManage').innerHTML = state.accounts.map(a => `<div class="acc-row"><div><div class="acc-name">${esc(a.name)} <span class="tag">${M.ACCOUNT_SUBTYPES[a.subtype].label}</span></div><div class="acc-sub">${M.ACCOUNT_SUBTYPES[a.subtype].manage==='usage'?'残高管理なし・利用時に同額を特典収入として自動計上':'期首 '+yen(a.opening||0)}${a.subtype === 'voucher_goods' ? ' · 期首枚数' + ((a.goods&&a.goods.openingQty)||0) + '枚' + (((a.goods&&a.goods.faceHistory)||[]).length ? ' · 額面履歴' + ((a.goods&&a.goods.faceHistory)||[]).length + '件' : '') : ''}${a.subtype === 'card' && a.card ? ' · 締め' + (a.card.closingDay === 99 ? '末' : a.card.closingDay + '日') + '／引落' + a.card.payDay + '日' : ''}</div></div><div class="row" style="gap:6px"><button class="btn ghost sm" data-accdetail="${a.id}">詳細</button>${a.subtype==='point'?`<button class="btn ghost sm" data-pointbalance="${a.id}">残高登録</button>`:''}<button class="btn ghost sm" data-edit="${a.id}">編集</button><button class="btn danger sm" data-delacc="${a.id}">削除</button></div></div>`).join('');
    $$('[data-edit]', $('#accManage')).forEach(b => b.addEventListener('click', () => openAccountModal(b.dataset.edit)));
    $$('[data-accdetail]', $('#accManage')).forEach(b=>b.addEventListener('click',()=>openAccountDetailModal(b.dataset.accdetail))); $$('[data-pointbalance]', $('#accManage')).forEach(b=>b.addEventListener('click',()=>openPointBalanceModal(b.dataset.pointbalance)));
    $$('[data-delacc]').forEach(b => b.addEventListener('click', () => { const used = state.transactions.some(t => t.lines.some(l => l.ref === 'acc:' + b.dataset.delacc)); if (used) return toast('この口座を使う取引があるため削除できません'); if (!confirm('口座を削除しますか？')) return; state.accounts = state.accounts.filter(a => a.id !== b.dataset.delacc); persist(); renderAccounts(); toast('削除しました'); }));
  }
  function openAccountModal(id) {
    const editing = id ? accById(id) : null; const a = editing || { name: '', subtype: 'cash', opening: 0 }; const subOpts = Object.entries(M.ACCOUNT_SUBTYPES).map(([k, v]) => `<option value="${k}" ${k === a.subtype ? 'selected' : ''}>${v.label}</option>`).join('');
    $('#modal').innerHTML = `<h3>${editing ? '口座を編集' : '口座を追加'}</h3><div class="field"><label>口座名</label><input id="m_name" value="${esc(a.name)}" placeholder="例: 楽天カード / WAON / 楽天期間限定ポイント"></div><div class="field"><label>種類</label><select id="m_sub">${subOpts}</select></div><div class="field"><label>期首残高</label><input type="number" id="m_open" value="${a.opening || 0}"></div><div id="m_extra"></div><div class="actions"><button class="btn ghost" id="m_cancel">キャンセル</button><button class="btn" id="m_save">保存</button></div>`;
    const renderExtra = () => { const sub = $('#m_sub').value, ex = $('#m_extra'); const open=$('#m_open'); const usage=M.ACCOUNT_SUBTYPES[sub]&&M.ACCOUNT_SUBTYPES[sub].manage==='usage'; if(open){open.disabled=usage;if(usage)open.value=0;} if (usage) ex.innerHTML = `<p class="hint">残高は管理しません。支払に使った金額と同額を「特典利用」として自動計上し、この口座の残高は実質0のまま保ちます。期間限定ポイント、店舗ポイント、値引特典などに向いています。</p>`; else if (sub === 'card') ex.innerHTML = `<div class="row"><div class="field"><label>締め日</label><select id="m_close">${[['99', '末日'], ['15', '15日'], ['20', '20日'], ['25', '25日'], ['10', '10日'], ['5', '5日']].map(([v, l]) => `<option value="${v}" ${(a.card && String(a.card.closingDay) === v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label>引落日(毎月)</label><input type="number" id="m_payday" min="1" max="31" value="${a.card?.payDay || 27}"></div><div class="field"><label>引落は締めの</label><select id="m_after"><option value="1" ${(!a.card || a.card.payMonthsAfter !== 2) ? 'selected' : ''}>翌月</option><option value="2" ${(a.card && a.card.payMonthsAfter === 2) ? 'selected' : ''}>翌々月</option></select></div></div>`; else if (sub === 'voucher_goods') { const hist=(a.goods&&a.goods.faceHistory)||[]; const histRows=hist.map((h,i)=>`<div class="credit-line face-history-row" data-i="${i}"><div class="field credit-amt-field"><label>日付</label><input type="date" class="m_face_date" value="${esc(h.date||'')}"></div><div class="field credit-amt-field"><label>1枚額面</label><input type="number" class="m_face_unit" value="${esc(h.unit||'')}"></div><button class="btn danger sm m_face_del" type="button">削除</button></div>`).join(''); ex.innerHTML = `<div class="field"><label>期首の残枚数</label><input type="number" id="m_openqty" value="${a.goods?.openingQty || 0}"></div><p class="hint">額面履歴を入れると、その日付以降は「枚数 × 1枚額面」で現物券の利用額を計算します。4月以前から持っているチケットは、期首日または 2026-04-01 などで1枚額面を登録してください。</p><div class="receipt-cards" id="m_facehist">${histRows||'<p class="muted">額面履歴なし。残高÷枚数で計算します。</p>'}</div><button class="btn ghost sm" type="button" id="m_face_add">＋額面履歴</button>`; const addRow=()=>{ const host=$('#m_facehist'); if(host.querySelector('.muted')) host.innerHTML=''; const row=el('div',{class:'credit-line face-history-row'}); row.innerHTML=`<div class="field credit-amt-field"><label>日付</label><input type="date" class="m_face_date" value="${M.todayStr()}"></div><div class="field credit-amt-field"><label>1枚額面</label><input type="number" class="m_face_unit" placeholder="例: 530"></div><button class="btn danger sm m_face_del" type="button">削除</button>`; host.appendChild(row); row.querySelector('.m_face_del').addEventListener('click',()=>row.remove()); attachHankakuAll(row); }; setTimeout(()=>{ const b=$('#m_face_add'); if(b)b.addEventListener('click',addRow); $$('.m_face_del', ex).forEach(btn=>btn.addEventListener('click',()=>btn.closest('.face-history-row').remove())); },0); } else if (sub === 'transit') ex.innerHTML = `<p class="hint">簡易モード：チャージ時に全額費用化（残高管理なし）。</p>`; else ex.innerHTML = ''; attachHankakuAll(ex); };
    renderExtra(); $('#m_sub').addEventListener('change', renderExtra); $('#m_cancel').addEventListener('click', closeModal);
    $('#m_save').addEventListener('click', () => { const name = $('#m_name').value.trim(); if (!name) return toast('口座名を入力してください'); const sub = $('#m_sub').value; const obj = editing || { id: 'a_' + Math.random().toString(36).slice(2, 8) }; obj.name = name; obj.subtype = sub; obj.opening = (M.ACCOUNT_SUBTYPES[sub]&&M.ACCOUNT_SUBTYPES[sub].manage==='usage') ? 0 : (+$('#m_open').value || 0); if (sub === 'card') obj.card = { closingDay: +$('#m_close').value, payDay: +$('#m_payday').value || 27, payMonthsAfter: +$('#m_after').value }; if (sub === 'voucher_goods') { const faceHistory=[]; $$('#m_facehist .face-history-row').forEach(row=>{ const date=row.querySelector('.m_face_date')?.value||''; const unit=+(row.querySelector('.m_face_unit')?.value||0); if(date&&unit>0) faceHistory.push({date,unit}); }); faceHistory.sort((a,b)=>a.date.localeCompare(b.date)); obj.goods = { openingQty: +($('#m_openqty')?.value || 0), faceHistory }; } if (!editing) state.accounts.push(obj); persist(); closeModal(); renderAccounts(); renderEntry(); toast('保存しました ✓'); });
    showModal();
  }

  /* ============ カード請求：請求月調整と部分消込 ============ */
  function shiftCardCycle(ym,delta){return M.idxToYM(M.ymIndex(ym)+delta);}

  function cardCyclePurchaseRows(cardId,cycleKey){
   const card=accById(cardId);if(!card||card.subtype!=='card')return [];
   const center=M.ymIndex(cycleKey);
   return state.transactions.filter(t=>t.kind!=='card_payment').map(t=>{
    const amount=-(t.lines||[]).filter(l=>l.ref==='acc:'+cardId).reduce((n,l)=>n+(l.amount||0),0);
    if(Math.abs(amount)<0.5)return null;
    const automatic=M.cardCloseInfo(card,t.date).cycleKey;
    const override=t.meta&&t.meta.cardCycleOverrides&&t.meta.cardCycleOverrides[cardId]||'';
    const effective=override||automatic;
    if(Math.abs(M.ymIndex(automatic)-center)>2&&Math.abs(M.ymIndex(effective)-center)>2)return null;
    return {id:t.id,date:t.date,store:t.store||'',branch:t.branch||'',memo:t.memo||'',amount,automatic,override,effective};
   }).filter(Boolean).sort((a,b)=>{
    const ai=a.effective===cycleKey?0:1,bi=b.effective===cycleKey?0:1;
    return ai-bi||b.date.localeCompare(a.date)||a.id.localeCompare(b.id);
   });
  }

  function previewCardCycleChanges(cardId,changes){
   const card=accById(cardId);if(!card||card.subtype!=='card')throw new Error('カード口座が見つかりません');
   const requested=changes||{},ids=new Set(Object.keys(requested)),seen=new Set();
   const transactions=state.transactions.map(t=>{
    if(!ids.has(t.id))return t;
    seen.add(t.id);
    if(t.kind==='card_payment'||!(t.lines||[]).some(l=>l.ref==='acc:'+cardId))throw new Error('このカードに属さない取引は変更できません');
    const value=requested[t.id];
    if(value!=null&&value!==''&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw new Error('請求締め月の形式が不正です');
    const meta={...(t.meta||{})},overrides={...(meta.cardCycleOverrides||{})};
    if(value)overrides[cardId]=value;else delete overrides[cardId];
    if(Object.keys(overrides).length)meta.cardCycleOverrides=overrides;else delete meta.cardCycleOverrides;
    return {...t,meta:Object.keys(meta).length?meta:null};
   });
   if(seen.size!==ids.size)throw new Error('対象取引が見つかりません');
   const previewState={...state,transactions};return {previewState,cycles:M.cardCycles(previewState,cardId)};
  }

  function findCardCycleOverpayment(cardId,projectedCycles){
   const before=new Map(M.cardCycles(state,cardId).map(c=>[c.key,c.outstanding]));
   return projectedCycles.find(c=>c.outstanding<-.5&&c.outstanding<(before.has(c.key)?before.get(c.key):0)-.5)||null;
  }

  function renderCards(){
   const host=$('#cardCycles');if(!host)return;
   const cards=accountsBy(a=>a.subtype==='card');
   if(!cards.length){host.innerHTML='<p class="muted">カード口座がありません。「残高・口座」から追加してください。</p>';return;}
   let html='';
   for(const card of cards){
    const cycles=M.cardCycles(state,card.id);
    const dueTotal=cycles.filter(c=>c.due&&c.outstanding>.5).reduce((s,c)=>s+c.outstanding,0);
    html+=`<div style="margin-bottom:14px"><div class="section-title" style="margin-bottom:8px"><h3 style="margin:0">${esc(card.name)} <span class="acc-sub">未払 合計 ${yen(M.accountBalance(state,card.id))}</span></h3>${dueTotal>0?`<button class="btn sm" data-payall="${esc(card.id)}">期限到来分をまとめて消込 (${yen(dueTotal)})</button>`:''}</div>`;
    if(!cycles.length)html+='<p class="muted">請求はありません。</p>';
    cycles.slice().reverse().forEach(c=>{
     const badge=c.settled?'<span class="badge ok">消込済</span>':c.due?'<span class="badge due">要支払</span>':'<span class="badge plan">予定</span>';
     const label=c.outstanding>.5?'消込・請求調整':'請求月を調整';
     html+=`<div class="cycle-row ${c.settled?'settled':c.due?'due':''}"><div><div class="acc-name">${esc(c.key)} 締め${badge}</div><div class="acc-sub">引落予定 ${esc(c.payDate)} ・ 請求 ${yen(c.charge)}${c.paid?' ・ 消込済 '+yen(c.paid):''}</div></div><div style="text-align:right"><div class="num" style="font-weight:700">${yen(c.outstanding)}</div><button type="button" class="btn ghost sm" data-reconcile="${esc(card.id)}|${esc(c.key)}">${label}</button></div></div>`;
    });
    html+='</div>';
   }
   host.innerHTML=html;
   $('[data-reconcile]',host).forEach(b=>b.addEventListener('click',()=>{const [cardId,ym]=b.dataset.reconcile.split('|');openCardReconcileModal(cardId,ym);}));
   $('[data-payall]',host).forEach(b=>b.addEventListener('click',()=>payAllDue(b.dataset.payall)));
  }

  function openCardReconcileModal(cardId,cycleKey,previousDraft){
   const card=accById(cardId);if(!card)return toast('カード口座が見つかりません');
   const rows=cardCyclePurchaseRows(cardId,cycleKey),pending={...(previousDraft||{})};
   const effective=r=>Object.prototype.hasOwnProperty.call(pending,r.id)?(pending[r.id]||r.automatic):r.effective;
   const chosenOverride=r=>Object.prototype.hasOwnProperty.call(pending,r.id)?(pending[r.id]||''):(r.override||'');
   const assignments=()=>Object.fromEntries(rows.filter(r=>chosenOverride(r)!==(r.override||'')).map(r=>[r.id,chosenOverride(r)||null]));
   const rowHtml=r=>{
    const active=effective(r),value=chosenOverride(r);
    const keys=[...new Set([-2,-1,0,1,2,3].map(n=>shiftCardCycle(cycleKey,n)).concat([r.automatic,r.effective,value].filter(Boolean)))].sort();
    const options=[`<option value="" ${!value?'selected':''}>自動判定 (${esc(r.automatic)})</option>`].concat(keys.map(k=>`<option value="${k}" ${value===k?'selected':''}>${k}${k===cycleKey?'（今回）':''}</option>`)).join('');
    return `<div class="card-reconcile-item" data-card-tx="${esc(r.id)}"><label class="card-reconcile-main"><input type="checkbox" class="cr-include" ${active===cycleKey?'checked':''} aria-label="今回の請求に含める"><span><strong>${esc(r.date)} · ${esc(r.store||'店名なし')}${r.branch?' / '+esc(r.branch):''}</strong><small>自動 ${esc(r.automatic)}締め${r.override?' ・ 変更済 '+esc(r.override)+'締め':''}</small></span><b>${yen(r.amount)}</b></label><label class="card-reconcile-select">請求締め月 <select class="cr-month">${options}</select></label></div>`;
   };
   const current=rows.filter(r=>r.effective===cycleKey),nearby=rows.filter(r=>r.effective!==cycleKey);
   const host=$('#modal');host.classList.add('card-reconcile-modal');
   host.innerHTML=`<h3>${esc(card.name)} · ${esc(cycleKey)}締め</h3><p class="hint">今回の請求に載った取引を選択してください。チェックを外すと翌月締めに移動します。請求月欄から他の月や自動判定にも変更できます。購入日・支出額は変更しません。</p><div class="card-reconcile-summary"><div>調整後の請求額 <strong id="cr-charge"></strong></div><div>既に消込済 <strong id="cr-paid"></strong></div><div>今回の請求残 <strong id="cr-outstanding"></strong></div></div><div class="card-reconcile-list"><div class="card-reconcile-caption">この締め月に割り当てられている取引 (${current.length}件)</div>${current.map(rowHtml).join('')||'<p class="hint">今回の取引はありません。</p>'}<details class="card-reconcile-near"><summary>前後2か月の候補から追加 (${nearby.length}件)</summary>${nearby.map(rowHtml).join('')||'<p class="hint">候補はありません。</p>'}</details></div><div class="balance-warn" id="cr-warning"></div><div class="actions"><button type="button" class="btn ghost" id="cr-cancel">キャンセル</button><button type="button" class="btn ghost" id="cr-save">請求月だけ保存</button><button type="button" class="btn" id="cr-next">この内容で消込へ</button></div>`;
   const refresh=()=>{
    try{
     const changes=assignments(),projected=previewCardCycleChanges(cardId,changes);
     const bad=findCardCycleOverpayment(cardId,projected.cycles),cycle=projected.cycles.find(c=>c.key===cycleKey);
     const total=cycle?cycle.charge:0,paid=cycle?cycle.paid:0,remaining=cycle?cycle.outstanding:0;
     $('#cr-charge').textContent=yen(total);$('#cr-paid').textContent=yen(paid);$('#cr-outstanding').textContent=yen(remaining);
     $('#cr-warning').textContent=bad?`${bad.key}締めの消込済額が請求額を超えてしまいます。移動内容を調整してください。`:remaining<=.5?'この締め月に新たに消し込む残額はありません。請求月の調整だけは保存できます。':'';
     $('#cr-save').disabled=!!bad||Object.keys(changes).length===0;
     $('#cr-next').disabled=!!bad||remaining<=.5;
     return {changes,projected,cycle,remaining,bad};
    }catch(e){$('#cr-warning').textContent=e.message;$('#cr-save').disabled=true;$('#cr-next').disabled=true;return null;}
   };
   $('.card-reconcile-item',host).forEach(item=>{
    const row=rows.find(r=>r.id===item.dataset.cardTx),check=item.querySelector('.cr-include'),select=item.querySelector('.cr-month');
    select.addEventListener('change',()=>{pending[row.id]=select.value||null;check.checked=effective(row)===cycleKey;refresh();});
    check.addEventListener('change',()=>{pending[row.id]=check.checked?cycleKey:shiftCardCycle(cycleKey,1);select.value=pending[row.id];refresh();});
   });
   $('#cr-cancel').addEventListener('click',closeModal);
   $('#cr-save').addEventListener('click',()=>{
    const result=refresh();if(!result||result.bad)return;
    if(!Object.keys(result.changes).length)return toast('変更はありません');
    state.transactions=result.projected.previewState.transactions;persist();closeModal();renderCards();renderList();renderAccounts();toast('請求月を更新しました');
   });
   $('#cr-next').addEventListener('click',()=>{
    const result=refresh();if(!result||result.bad||result.remaining<=.5)return;
    const account=accountsBy(a=>a.subtype==='bank')[0]||accountsBy(a=>a.subtype==='cash')[0];
    if(!account)return toast('銀行または現金の支払元口座が必要です');
    const defaultDate=result.cycle?result.cycle.payDate:M.todayStr();
    payModalContent('カード請求の消込',cardId,cycleKey,defaultDate,result.remaining,defaultDate,[{accId:account.id,amount:Math.round(result.remaining)}],null,{assignments:result.changes,back:()=>openCardReconcileModal(cardId,cycleKey,pending)});
   });
   refresh();showModal();
  }

  function payModalContent(title,cardId,cycleKey,payDate,outstanding,date,credits,editId,options){
   const opts=options||{},stagedChanges=opts.assignments||{};
   const original=(credits||[]).reduce((s,c)=>s+(+c.amount||0),0),cap=Math.round(Number(outstanding)||0);
   ui._payCredits=(credits||[]).map(c=>({...c}));
   let mode=editId&&original<cap-.5?'partial':'all',partialAmount=mode==='partial'?Math.round(original):cap;
   const host=$('#modal');host.classList.remove('card-reconcile-modal');
   const amountTarget=()=>mode==='partial'?partialAmount:cap;
   const draw=()=>{
    const paymentOptionsHtml=selected=>'<option value="">支払元を選択</option>'+paymentOptions(selected,a=>['bank','cash','point','emoney'].includes(a.subtype));
    const creditRows=ui._payCredits.map((c,i)=>`<div class="credit-line card-payment-row" data-i="${i}"><div class="field" style="flex:2"><select class="pc_acc">${paymentOptionsHtml(c.accId)}</select></div><div class="field amt"><input type="number" class="pc_amt" min="0" step="1" value="${Number(c.amount)||0}" aria-label="支払元の金額"></div><button type="button" class="btn ghost sm pc_del" aria-label="支払元を削除">✕</button></div>`).join('');
    host.innerHTML=`<h3>${esc(title)}</h3><p class="hint">${esc(accName(cardId))} / ${esc(cycleKey)}締め · 請求残 ${yen(cap)}。一部のみ消込した場合は残額を次回も消し込めます。</p>${Object.keys(stagedChanges).length?'<p class="hint">請求月の変更は、この消込を保存するときに同時に反映されます。</p>':''}<div class="field"><label>消込方法</label><select id="pay_scope"><option value="all" ${mode==='all'?'selected':''}>残額を全額消込</option><option value="partial" ${mode==='partial'?'selected':''}>一部だけ消込</option></select></div><div class="field" id="pay_partial_field" ${mode!=='partial'?'style="display:none"':''}><label>今回の消込額（円）</label><input type="number" id="pay_partial_amount" min="1" max="${cap}" step="1" value="${partialAmount}"></div><div class="field"><label>実際の引落日</label><input type="date" id="pay_date" value="${esc(date)}"></div><label>支払元（複数可）</label>${creditRows}<button type="button" class="btn ghost sm" id="pay_add">＋支払元を追加</button><div class="totline"><span>支払元の合計 <span class="muted" id="pay_diff"></span></span><span class="v" id="pay_sum"></span></div><div class="balance-warn" id="pay_warn"></div><div class="actions"><button type="button" class="btn ghost" id="pay_cancel">キャンセル</button>${typeof opts.back==='function'?'<button type="button" class="btn ghost" id="pay_back">請求選択に戻る</button>':''}<button type="button" class="btn ghost sm" id="pay_fill">差額を支払元へ反映</button><button type="button" class="btn" id="pay_ok">${editId?'更新する':'消込する'}</button></div>`;
    const updateTotals=()=>{
     const amount=amountTarget(),sum=ui._payCredits.reduce((s,c)=>s+(+c.amount||0),0),matched=Math.abs(sum-amount)<.5;
     const valid=Number.isInteger(amount)&&amount>0&&amount<=cap&&matched&&ui._payCredits.every(c=>!c.amount||!!c.accId)&&ui._payCredits.every(c=>Number.isInteger(+c.amount)&&+c.amount>=0);
     $('#pay_sum').textContent=yen(sum);$('#pay_diff').textContent=matched?'（一致）':`（差 ${yen(amount-sum)}）`;
     $('#pay_warn').textContent=amount<=0||amount>cap||!Number.isInteger(amount)?`消込額は1円以上、${yen(cap)}以下の整数で指定してください。`:matched?'':'今回の消込額と支払元の合計を一致させてください。';
     $('#pay_ok').disabled=!valid;return valid;
    };
    $('#pay_scope').addEventListener('change',e=>{
     mode=e.target.value;
     if(mode==='partial'){partialAmount=Math.min(cap,Math.max(1,ui._payCredits.reduce((s,c)=>s+(+c.amount||0),0)));$('#pay_partial_amount').value=partialAmount;}
     $('#pay_partial_field').style.display=mode==='partial'?'':'none';updateTotals();
    });
    $('#pay_partial_amount').addEventListener('input',e=>{
     partialAmount=e.target.value===''?0:Number(e.target.value);
     if(ui._payCredits.length===1){ui._payCredits[0].amount=partialAmount;const inp=host.querySelector('.pc_amt');if(inp)inp.value=partialAmount;}
     updateTotals();
    });
    $('.card-payment-row',host).forEach(row=>{
     const i=+row.dataset.i;
     row.querySelector('.pc_acc').addEventListener('change',e=>{ui._payCredits[i].accId=e.target.value;updateTotals();});
     row.querySelector('.pc_amt').addEventListener('input',e=>{ui._payCredits[i].amount=e.target.value===''?0:Number(e.target.value);updateTotals();});
     row.querySelector('.pc_del').addEventListener('click',()=>{ui._payCredits.splice(i,1);if(!ui._payCredits.length)ui._payCredits.push({accId:'',amount:0});draw();});
    });
    $('#pay_add').addEventListener('click',()=>{const used=ui._payCredits.reduce((s,c)=>s+(+c.amount||0),0);ui._payCredits.push({accId:'',amount:Math.max(0,amountTarget()-used)});draw();});
    $('#pay_fill').addEventListener('click',()=>{
     const used=ui._payCredits.reduce((s,c)=>s+(+c.amount||0),0),last=ui._payCredits[ui._payCredits.length-1];if(!last)return;
     const next=(+last.amount||0)+amountTarget()-used;if(next<0)return toast('先に他の支払元の金額を減らしてください');
     last.amount=next;const rows=$('.card-payment-row',host);if(rows.length)rows[rows.length-1].querySelector('.pc_amt').value=next;updateTotals();
    });
    $('#pay_cancel').addEventListener('click',closeModal);
    if(opts.back)$('#pay_back').addEventListener('click',opts.back);
    $('#pay_ok').addEventListener('click',()=>{
     if(!updateTotals())return;
     if(!$('#pay_date').value)return toast('引落日を入力してください');
     let preview;try{preview=previewCardCycleChanges(cardId,stagedChanges);}catch(e){return toast(e.message);}
     if(findCardCycleOverpayment(cardId,preview.cycles))return toast('請求月の変更で消込額が超過します');
     const cycle=preview.cycles.find(c=>c.key===cycleKey),existing=editId&&state.transactions.find(t=>t.id===editId);
     const currentPaid=existing?existing.lines.filter(l=>l.ref==='acc:'+cardId&&l.amount>0).reduce((s,l)=>s+l.amount,0):0;
     const availableNow=(cycle?cycle.outstanding:0)+currentPaid,amount=amountTarget();
     if(amount>availableNow+.5||amount<=0)return toast('請求残額を再確認してください');
     const creditsToSave=ui._payCredits.filter(c=>+c.amount>0).map(c=>isUnmanagedPoint(c.accId)?{ref:UNMANAGED_POINT_REF,amount:+c.amount}:{accId:c.accId,amount:+c.amount});
     if(!creditsToSave.length)return toast('支払元が必要です');
     const t=M.buildCardPayment({id:editId,date:$('#pay_date').value,cardAccId:cardId,credits:creditsToSave,cycleKey,payDate});
     const errors=M.validateTransaction(t);if(errors.length)return toast(errors.join(' / '));
     if(editId&&!existing)return toast('編集中の消込が見つかりません');
     if(Object.keys(stagedChanges).length)state.transactions=preview.previewState.transactions;
     if(editId)state.transactions[state.transactions.findIndex(x=>x.id===editId)]=t;else state.transactions.push(t);
     persist();closeModal();renderCards();renderAccounts();renderList();renderDrill();renderReport();
     toast(editId?'消込を更新しました':'消込を登録しました');
    });
    updateTotals();decorateInputs(host);
   };
   draw();
  }
  function payAllDue(cardId) { const bank = accountsBy(a => a.subtype === 'bank')[0] || accountsBy(a => a.subtype === 'cash')[0]; if (!bank) return toast('引落元の銀行/現金口座がありません'); const due = M.cardCycles(state, cardId).filter(c => c.due && !c.settled); if (!due.length) return toast('期限到来分はありません'); if (!confirm(`${due.length}件の請求を ${bank.name} からまとめて消込します。よろしいですか？`)) return; due.forEach(c => state.transactions.push(M.buildCardPayment({ date: c.payDate, cardAccId: cardId, credits: [{ accId: bank.id, amount: c.outstanding }], cycleKey: c.key, payDate: c.payDate }))); persist(); renderCards(); renderAccounts(); renderList(); toast(`${due.length}件を消込しました ✓`); }

