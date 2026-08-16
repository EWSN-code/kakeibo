/* =====================================================================
 * model.js  ―  会計エンジン / データモデル / 既定データ / ダミー （無改修）
 * ===================================================================== */
(function (root) {
  'use strict';

  const ACCOUNT_SUBTYPES = {
    cash:          { label: '現金',              kind: 'asset',     manage: 'balance' },
    bank:          { label: '銀行口座',          kind: 'asset',     manage: 'balance' },
    emoney:        { label: '電子マネー(金額型)', kind: 'asset',     manage: 'balance' },
    point:         { label: 'ポイント',          kind: 'asset',     manage: 'balance' },
    voucher_amount:{ label: '金券(金額型)',      kind: 'asset',     manage: 'balance' },
    voucher_goods: { label: '現物券(額面評価)',  kind: 'asset',     manage: 'goods'   },
    transit:       { label: '交通系IC(簡易)',    kind: 'asset',     manage: 'simple'  },
    card:          { label: 'クレジットカード',  kind: 'liability', manage: 'balance' },
  };

  const DEFAULT_CATEGORIES = {
    expense: {
      '食費': { '外食': ['ランチ', 'ディナー', 'カフェ・軽食'], '中食': ['惣菜・弁当', 'テイクアウト'], '食材': ['主食', '肉・魚', '野菜・果物', '乳・卵', '調味料・油', '飲料', '嗜好品・菓子'] },
      '日用品': { '消耗品': [], '衛生用品': [] }, '水道光熱費': { '電気': [], 'ガス': [], '水道': [] },
      '住居': { '家賃': [], '管理費': [], '修繕': [] }, '交通費': { '電車・バス': [], 'ガソリン': [], 'タクシー': [] },
      '通信費': { '携帯': [], 'ネット': [] }, '医療・健康': { '診察・薬': [], '運動': [] },
      '交際費': { '飲み会': [], '贈答': [] }, '趣味・娯楽': { '音楽': [], '書籍': [], 'サブスク': [] },
      '被服・美容': { '衣類': [], '美容': [] }, '教養・教育': {}, '税・社会保険': {}, 'その他': { '雑費': [] },
    },
    income: { '給与': {}, '賞与': {}, '副収入': {}, 'ポイント獲得': {}, '利息': {}, 'プレミアム益': {}, 'その他収入': {} },
  };

  function defaultAccounts() { return [{ id: 'a_cash', name: '現金', subtype: 'cash', opening: 0 }, { id: 'a_bank', name: '銀行(メイン)', subtype: 'bank', opening: 0 }]; }
  function initialState() { return { version: 7, accounts: defaultAccounts(), categories: deepClone(DEFAULT_CATEGORIES), transactions: [], recurring: [], budgets: {}, budgetRollover: false, goals: [], wishlist: [], priceLogs: [], templates: [], readings: {}, meta: { createdAt: new Date().toISOString() } }; }
  function migrate(s) {
    if (!s.recurring) s.recurring = []; for (const r of s.recurring) { if (r.intervalMonths == null) r.intervalMonths = 1; if (!('anchorYM' in r)) r.anchorYM = null; if (!r.bizAdjust) r.bizAdjust = 'none'; }
    if (!s.budgets) s.budgets = {}; if (!s.goals) s.goals = []; if (!s.wishlist) s.wishlist = []; if (!s.priceLogs) s.priceLogs = [];
    if (s.budgetRollover == null) s.budgetRollover = false; if (!s.templates) s.templates = []; if (!s.readings) s.readings = {};
    for (const w of s.wishlist) { if (!w.tags) w.tags = []; if (!w.status) w.status = 'active'; if (!('store' in w)) w.store = ''; if (!('url' in w)) w.url = ''; }
    for (const t of s.templates) { if (!t.padMode) t.padMode = 'calc'; }
    if (s.version == null || s.version < 7) s.version = 7; return s;
  }

  function toHankaku(str) {
    return String(str == null ? '' : str)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[．。]/g, '.').replace(/[，]/g, ',')
      .replace(/[＋]/g, '+').replace(/[－―‐]/g, '-').replace(/[＊×]/g, '*').replace(/[／÷]/g, '/')
      .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[　]/g, ' ');
  }
  function normReading(str) { let s = String(str == null ? '' : str).toLowerCase(); s = s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); s = s.replace(/[ー・\s（）()･]/g, ''); return s; }
  function matchCandidates(candidates, query, limit, readings) { const q = normReading(query); if (!q) return []; const out = []; for (const c of candidates) { const key = normReading(c); const yomi = readings && readings[c] ? normReading(readings[c]) : ''; if (key.includes(q) || (yomi && yomi.includes(q))) { out.push(c); if (out.length >= (limit || 8)) break; } } return out; }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function nthMonday(year, month, nth) { const first = new Date(year, month - 1, 1).getDay(); const offset = (1 - first + 7) % 7; return 1 + offset + (nth - 1) * 7; }
  const _holCache = {};
  function jpHolidays(year) {
    if (_holCache[year]) return _holCache[year];
    const H = {}; const add = (m, d, name) => { if (d >= 1) H[ymd(year, m, d)] = name; };
    add(1, 1, '元日'); add(2, 11, '建国記念の日'); add(2, 23, '天皇誕生日'); add(4, 29, '昭和の日'); add(5, 3, '憲法記念日'); add(5, 4, 'みどりの日'); add(5, 5, 'こどもの日'); add(8, 11, '山の日'); add(11, 3, '文化の日'); add(11, 23, '勤労感謝の日');
    add(1, nthMonday(year, 1, 2), '成人の日'); add(7, nthMonday(year, 7, 3), '海の日'); add(9, nthMonday(year, 9, 3), '敬老の日'); add(10, nthMonday(year, 10, 2), 'スポーツの日');
    add(3, Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), '春分の日'); add(9, Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), '秋分の日');
    const base = Object.keys(H).sort();
    for (let i = 0; i < base.length; i++) { const d0 = new Date(base[i] + 'T00:00:00'); const dPrev = new Date(d0); dPrev.setDate(dPrev.getDate() - 2); const mid = new Date(d0); mid.setDate(mid.getDate() - 1); const midStr = mid.toISOString().slice(0, 10), prevStr = dPrev.toISOString().slice(0, 10); if (H[prevStr] && !H[midStr] && mid.getDay() !== 0) H[midStr] = '国民の休日'; }
    for (const ds of Object.keys(H).sort()) { const d = new Date(ds + 'T00:00:00'); if (d.getDay() === 0) { let nx = new Date(d); do { nx.setDate(nx.getDate() + 1); } while (H[nx.toISOString().slice(0, 10)]); H[nx.toISOString().slice(0, 10)] = '振替休日'; } }
    _holCache[year] = H; return H;
  }
  function isHoliday(dateStr) { return !!jpHolidays(+dateStr.slice(0, 4))[dateStr]; }
  function holidayName(dateStr) { return jpHolidays(+dateStr.slice(0, 4))[dateStr] || null; }
  function isBusinessDay(dateStr) { const d = new Date(dateStr + 'T00:00:00'); const g = d.getDay(); return g !== 0 && g !== 6 && !isHoliday(dateStr); }
  function adjustBusinessDay(dateStr, mode) { if (mode !== 'next' && mode !== 'prev') return dateStr; let d = new Date(dateStr + 'T00:00:00'); const step = mode === 'next' ? 1 : -1; let guard = 0; while (guard++ < 40) { const ds = d.toISOString().slice(0, 10); if (isBusinessDay(ds)) return ds; d.setDate(d.getDate() + step); } return dateStr; }

  function accountBalance(state, accId) { const acc = state.accounts.find(a => a.id === accId); if (!acc) return 0; const sub = ACCOUNT_SUBTYPES[acc.subtype]; let sum = 0; for (const t of state.transactions) for (const ln of t.lines) if (ln.ref === 'acc:' + accId) sum += ln.amount; return sub.kind === 'asset' ? (acc.opening || 0) + sum : (acc.opening || 0) - sum; }
  function goodsQty(state, accId) { let q = 0; for (const t of state.transactions) for (const ln of t.lines) if (ln.ref === 'acc:' + accId && typeof ln.qty === 'number') q += ln.qty; const acc = state.accounts.find(a => a.id === accId); return ((acc && acc.goods && acc.goods.openingQty) || 0) + q; }
  function catKindOf(ref) { return ref.startsWith('cat:inc>') ? 'income' : 'expense'; }
  function monthlySummary(state, ym) { let income = 0, expense = 0; for (const t of state.transactions) { if (!t.date.startsWith(ym)) continue; for (const ln of t.lines) { if (!ln.ref.startsWith('cat:')) continue; if (catKindOf(ln.ref) === 'income') income += -ln.amount; else expense += ln.amount; } } return { income, expense, net: income - expense }; }
  function expenseByTopCategory(state, ym) { const map = {}; for (const t of state.transactions) { if (!t.date.startsWith(ym)) continue; for (const ln of t.lines) if (ln.ref.startsWith('cat:exp>') && ln.amount > 0) { const top = ln.ref.slice('cat:exp>'.length).split('>')[0]; map[top] = (map[top] || 0) + ln.amount; } } return map; }
  function incomeByTopCategory(state, ym) { const map = {}; for (const t of state.transactions) { if (!t.date.startsWith(ym)) continue; for (const ln of t.lines) if (ln.ref.startsWith('cat:inc>') && ln.amount < 0) { const top = ln.ref.slice('cat:inc>'.length).split('>')[0]; map[top] = (map[top] || 0) + (-ln.amount); } } return map; }
  function trailingMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1)); } return out; }

  function drillCategory(state, ym, kind, parts) { const pfx = kind === 'income' ? 'cat:inc>' : 'cat:exp>'; parts = parts || []; const depth = parts.length; const children = {}; let total = 0; for (const t of state.transactions) { if (ym && !t.date.startsWith(ym)) continue; for (const ln of t.lines) { if (!ln.ref.startsWith(pfx)) continue; const val = kind === 'income' ? -ln.amount : ln.amount; if (val <= 0) continue; const segs = ln.ref.slice(pfx.length).split('>'); let match = true; for (let i = 0; i < depth; i++) if (segs[i] !== parts[i]) { match = false; break; } if (!match) continue; total += val; const seg = segs[depth] != null ? segs[depth] : '(なし)'; const c = children[seg] || (children[seg] = { total: 0, count: 0, deeper: false }); c.total += val; c.count += 1; if (segs.length > depth + 1) c.deeper = true; } } const list = Object.entries(children).map(([segment, c]) => ({ segment, path: parts.concat(segment), total: c.total, count: c.count, hasChildren: c.deeper })).sort((a, b) => b.total - a.total); return { children: list, total, path: parts }; }
  function transactionsForCategory(state, ym, kind, parts) { const pfx = kind === 'income' ? 'cat:inc>' : 'cat:exp>'; const out = []; for (const t of state.transactions) { if (ym && !t.date.startsWith(ym)) continue; for (const ln of t.lines) { if (!ln.ref.startsWith(pfx)) continue; const val = kind === 'income' ? -ln.amount : ln.amount; if (val <= 0) continue; const segs = ln.ref.slice(pfx.length).split('>'); let match = true; for (let i = 0; i < parts.length; i++) if (segs[i] !== parts[i]) { match = false; break; } if (!match) continue; out.push({ date: t.date, store: t.store, branch: t.branch, memo: t.memo, amount: val, leaf: segs.join(' › '), txId: t.id }); } } return out.sort((a, b) => b.date.localeCompare(a.date)); }

  function cardCloseInfo(acc, dateStr) { const c = acc.card || {}; const closingDay = c.closingDay || 99, payDay = c.payDay || 27; const monthsAfter = (c.payMonthsAfter == null) ? 1 : c.payMonthsAfter; const d = new Date(dateStr + 'T00:00:00'); let y = d.getFullYear(), m = d.getMonth(), day = d.getDate(); const lastDay = new Date(y, m + 1, 0).getDate(); const effClosing = Math.min(closingDay, lastDay); let cm = m; if (day > effClosing) cm += 1; const closeDate = new Date(y, cm, 1); const cycleKey = closeDate.getFullYear() + '-' + pad2(closeDate.getMonth() + 1); const payLast = new Date(closeDate.getFullYear(), closeDate.getMonth() + monthsAfter + 1, 0).getDate(); const payDate = new Date(closeDate.getFullYear(), closeDate.getMonth() + monthsAfter, Math.min(payDay, payLast)); return { cycleKey, payDate: payDate.toISOString().slice(0, 10) }; }
  function cardCycles(state, accId, today) { const acc = state.accounts.find(a => a.id === accId); if (!acc || acc.subtype !== 'card') return []; today = today || todayStr(); const cycles = {}; const ensure = (k, payDate) => (cycles[k] || (cycles[k] = { key: k, payDate, charge: 0, paid: 0, txIds: [] })); for (const t of state.transactions) { if (t.kind === 'card_payment') continue; for (const ln of t.lines) if (ln.ref === 'acc:' + accId) { const info = cardCloseInfo(acc, t.date); const cy = ensure(info.cycleKey, info.payDate); cy.charge += -ln.amount; cy.txIds.push(t.id); } } for (const t of state.transactions) { if (t.kind !== 'card_payment' || !t.meta || t.meta.cardAccId !== accId) continue; for (const ln of t.lines) if (ln.ref === 'acc:' + accId && ln.amount > 0) { const cy = ensure(t.meta.cycleKey, t.meta.payDate || keyToPay(acc, t.meta.cycleKey)); cy.paid += ln.amount; } } return Object.values(cycles).map(c => ({ ...c, outstanding: c.charge - c.paid, due: c.payDate <= today, settled: Math.abs(c.charge - c.paid) < 0.5 })).sort((a, b) => a.key.localeCompare(b.key)); }
  function keyToPay(acc, cycleKey) { const [y, m] = cycleKey.split('-').map(Number); const c = acc.card || {}; const payDay = c.payDay || 27; const ma = (c.payMonthsAfter == null) ? 1 : c.payMonthsAfter; const last = new Date(y, (m - 1) + ma + 1, 0).getDate(); return new Date(y, (m - 1) + ma, Math.min(payDay, last)).toISOString().slice(0, 10); }

  function storeCategoryStats(state, store) { if (!store) return []; const cnt = {}; for (const t of state.transactions) { if (t.store !== store) continue; for (const ln of t.lines) if (ln.ref.startsWith('cat:exp>') && ln.amount > 0) { const p = ln.ref.slice(4); cnt[p] = (cnt[p] || 0) + 1; } } return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([path, n]) => ({ path, n })); }
  function storeBranchDefault(state, store) { for (let i = state.transactions.length - 1; i >= 0; i--) if (state.transactions[i].store === store && state.transactions[i].branch) return state.transactions[i].branch; return ''; }
  function lastStoreComposition(state, store) { if (!store) return null; for (let i = state.transactions.length - 1; i >= 0; i--) { const t = state.transactions[i]; if (t.store !== store || t.kind !== 'expense') continue; const items = t.lines.filter(l => l.ref.startsWith('cat:') && l.amount > 0).map(l => ({ catPath: l.ref.slice(4), amount: l.amount })); if (items.length) return { date: t.date, items }; } return null; }

  function evalAmount(input) { if (typeof input === 'number') return input; let s = toHankaku(String(input == null ? '' : input)).trim(); if (s === '') return 0; if (!/^[0-9+\-*/().\s]+$/.test(s)) return NaN; try { const v = Function('"use strict";return (' + s + ')')(); return (typeof v === 'number' && isFinite(v)) ? v : NaN; } catch (e) { return NaN; } }
  function validateTransaction(t) { const errs = []; if (!t.date) errs.push('日付が必要です'); if (!t.lines || t.lines.length < 2) errs.push('借方・貸方が必要です'); const sum = (t.lines || []).reduce((s, l) => s + l.amount, 0); if (Math.abs(sum) > 0.001) errs.push('貸借が一致していません(差額 ' + sum + ')'); return errs; }

  function tx(date, lines, store, branch, memo, kind, meta) { return { id: 't_' + Math.random().toString(36).slice(2, 10), date, lines, store: store || '', branch: branch || '', memo: memo || '', kind: kind || 'generic', meta: meta || null }; }
  function cleanLine(ref, amount, qty) { const l = { ref, amount }; if (qty != null) l.qty = qty; return l; }
  function buildMulti({ id, date, debits, credits, store, branch, memo, kind, meta }) { const lines = []; for (const d of debits) lines.push(cleanLine(d.ref, d.amount, d.qty)); for (const c of credits) lines.push(cleanLine(c.ref, -c.amount, c.qty != null ? -Math.abs(c.qty) : undefined)); const t = tx(date, lines, store, branch, memo, kind || 'generic', meta); if (id) t.id = id; return t; }
  function buildExpense({ id, date, items, catPath, amount, credits, store, branch, memo }) { const debits = items ? items.map(it => ({ ref: 'cat:' + it.catPath, amount: it.amount })) : [{ ref: 'cat:' + catPath, amount }]; const cr = credits.map(c => ({ ref: c.ref || ('acc:' + c.accId), amount: c.amount, qty: c.qty })); return buildMulti({ id, date, debits, credits: cr, store, branch, memo, kind: 'expense' }); }
  function buildIncome({ id, date, accId, catPath, amount, store, branch, memo }) { return buildMulti({ id, date, debits: [{ ref: 'acc:' + accId, amount }], credits: [{ ref: 'cat:' + catPath, amount }], store, branch, memo, kind: 'income' }); }
  function buildTransfer({ id, date, fromAccId, toAccId, amount, store, branch, memo, kind, meta }) { return buildMulti({ id, date, debits: [{ ref: 'acc:' + toAccId, amount }], credits: [{ ref: 'acc:' + fromAccId, amount }], store, branch, memo, kind: kind || 'transfer', meta }); }
  function buildCardPayment({ id, date, cardAccId, credits, bankAccId, amount, cycleKey, payDate, memo }) { if (!credits) credits = [{ accId: bankAccId, amount }]; const total = credits.reduce((s, c) => s + c.amount, 0); return buildMulti({ id, date, debits: [{ ref: 'acc:' + cardAccId, amount: total }], credits: credits.map(c => ({ ref: 'acc:' + c.accId, amount: c.amount })), memo: memo || ('カード引落 ' + cycleKey), kind: 'card_payment', meta: { cardAccId, cycleKey, payDate } }); }
  function buildPrepaidAmount({ id, date, toAccId, face, paid, fromAccId, store, branch, memo }) { const debits = [{ ref: 'acc:' + toAccId, amount: face }]; const credits = [{ ref: 'acc:' + fromAccId, amount: paid }]; const premium = face - paid; if (Math.abs(premium) > 0.001) credits.push({ ref: 'cat:inc>プレミアム益', amount: premium }); return buildMulti({ id, date, debits, credits, store, branch, memo, kind: 'prepaid_amount' }); }
  function buildPrepaidGoods({ id, date, toAccId, face, paid, qty, fromAccId, store, branch, memo }) { face = (face == null ? paid : face); const debits = [{ ref: 'acc:' + toAccId, amount: face, qty }]; const credits = [{ ref: 'acc:' + fromAccId, amount: paid }]; const premium = face - paid; if (Math.abs(premium) > 0.001) credits.push({ ref: 'cat:inc>プレミアム益', amount: premium }); return buildMulti({ id, date, debits, credits, store, branch, memo, kind: 'prepaid_goods' }); }
  function buildGoodsUse({ id, date, catPath, fromAccId, unitCost, qty, store, branch, memo }) { const amount = Math.round(unitCost * qty); return buildMulti({ id, date, debits: [{ ref: 'cat:' + catPath, amount }], credits: [{ ref: 'acc:' + fromAccId, amount, qty }], store, branch, memo, kind: 'goods_use' }); }

  function ymIndex(ym) { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); }
  function idxToYM(idx) { const y = Math.floor(idx / 12), m = idx % 12 + 1; return y + '-' + pad2(m); }
  function recOccursIn(rec, ym) { const iv = rec.intervalMonths || 1; if (iv <= 1) return true; if (!rec.anchorYM) return true; const diff = ymIndex(ym) - ymIndex(rec.anchorYM); return diff >= 0 && diff % iv === 0; }
  function pendingRecurring(state, uptoYM) { const out = []; for (const r of (state.recurring || [])) { if (r.active === false) continue; for (const ym of recMonthsBetween(r, uptoYM)) out.push({ rec: r, ym, date: recDate(r, ym) }); } return out; }
  function recMonthsBetween(rec, uptoYM) { const res = []; const upto = ymIndex(uptoYM); let start; if (!rec.lastApplied) { if (rec.anchorYM && (rec.intervalMonths || 1) > 1) start = ymIndex(rec.anchorYM); else start = upto; } else start = ymIndex(rec.lastApplied) + 1; for (let i = start; i <= upto; i++) { const ym = idxToYM(i); if (recOccursIn(rec, ym)) res.push(ym); } return res; }
  function recDate(rec, ym) { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const day = Math.min(rec.dayOfMonth || 1, last); return adjustBusinessDay(ymd(y, m, day), rec.bizAdjust || 'none'); }
  function buildFromRecurring(rec, ym, overrideAmount, overrideDate) { const date = overrideDate || recDate(rec, ym); const amount = (overrideAmount != null) ? overrideAmount : rec.params.amount; if (rec.builder === 'income') return buildIncome({ date, accId: rec.params.accId, catPath: rec.params.catPath, amount, store: rec.name, memo: '固定収入' }); return buildExpense({ date, catPath: rec.params.catPath, amount, credits: [{ accId: rec.params.accId, amount }], store: rec.name, memo: '固定費' }); }

  function budgetSpent(state, ym, catPath) { let sum = 0; const full = 'cat:' + catPath; for (const t of state.transactions) { if (!t.date.startsWith(ym)) continue; for (const ln of t.lines) { if (ln.amount > 0 && (ln.ref === full || ln.ref.startsWith(full + '>'))) sum += ln.amount; } } return sum; }
  function budgetCarry(state, ym, catPath) { const prev = trailingMonths(ym, 2)[0]; const base = (state.budgets || {})[catPath] || 0; return base - budgetSpent(state, prev, catPath); }
  function budgetReport(state, ym, rollover) { if (rollover == null) rollover = !!state.budgetRollover; const entries = Object.entries(state.budgets || {}).map(([catPath, amount]) => { const spent = budgetSpent(state, ym, catPath); const carry = rollover ? budgetCarry(state, ym, catPath) : 0; const eff = amount + carry; return { catPath, label: catPath.replace(/^exp>|^inc>/, '').split('>').join(' › '), budget: amount, carry, effective: eff, spent, remain: eff - spent, ratio: eff > 0 ? spent / eff : 0 }; }); entries.sort((a, b) => b.ratio - a.ratio); const totalBudget = entries.reduce((s, e) => s + e.effective, 0); const totalSpent = entries.reduce((s, e) => s + e.spent, 0); return { entries, totalBudget, totalSpent, totalRemain: totalBudget - totalSpent, rollover }; }
  function budgetForCategory(state, ym, kind, parts) { if (kind !== 'expense' || !parts || !parts.length) return null; const catPath = 'exp>' + parts.join('>'); const b = (state.budgets || {})[catPath]; if (b == null) return null; const spent = budgetSpent(state, ym, catPath); const carry = state.budgetRollover ? budgetCarry(state, ym, catPath) : 0; const eff = b + carry; return { budget: b, carry, effective: eff, spent, remain: eff - spent, ratio: eff > 0 ? spent / eff : 0 }; }
  function budgetableCategories(catTree) { const out = []; const root = catTree.expense; for (const top of Object.keys(root)) { out.push({ path: 'exp>' + top, label: top }); const mids = root[top]; for (const mid of Object.keys(mids || {})) { out.push({ path: 'exp>' + top + '>' + mid, label: top + ' › ' + mid }); for (const leaf of (mids[mid] || [])) out.push({ path: 'exp>' + top + '>' + mid + '>' + leaf, label: top + ' › ' + mid + ' › ' + leaf }); } } return out; }

  function avgMonthlySurplus(state, ym, n) { const months = trailingMonths(ym, n); let sum = 0; for (const m of months) sum += monthlySummary(state, m).net; return Math.round(sum / months.length); }
  function goalMonthsRemaining(goal, ym) { if (!goal.targetYM) return null; return ymIndex(goal.targetYM) - ymIndex(ym); }
  function goalRequiredMonthly(goal, ym) { const remain = Math.max(0, (goal.target || 0) - (goal.saved || 0)); if (!goal.targetYM) return null; const mr = goalMonthsRemaining(goal, ym); if (mr <= 0) return remain; return Math.ceil(remain / mr); }
  function goalProjectedYM(goal, monthly, ym) { const remain = Math.max(0, (goal.target || 0) - (goal.saved || 0)); if (remain <= 0) return ym; if (!monthly || monthly <= 0) return null; const months = Math.ceil(remain / monthly); return idxToYM(ymIndex(ym) + months); }
  function goalSorter(a, b) { return (a.priority - b.priority) || String(a.targetYM || '9999-99').localeCompare(String(b.targetYM || '9999-99')); }
  function simulateGoals(state, ym, monthlySurplus, maxMonths) { maxMonths = maxMonths || 240; const goals = (state.goals || []).map(g => ({ id: g.id, name: g.name, target: g.target, targetYM: g.targetYM, priority: g.priority || 3, remaining: Math.max(0, (g.target || 0) - (g.saved || 0)), doneYM: (g.target || 0) - (g.saved || 0) <= 0 ? ym : null })); if (monthlySurplus > 0) { for (let m = 0; m < maxMonths; m++) { const act = goals.filter(g => g.remaining > 0).sort(goalSorter); if (!act.length) break; let pool = monthlySurplus; for (const g of act) { if (pool <= 0) break; const put = Math.min(pool, g.remaining); g.remaining -= put; pool -= put; if (g.remaining <= 0 && !g.doneYM) g.doneYM = idxToYM(ymIndex(ym) + m); } } } return goals.map(g => ({ ...g, onTrack: !g.targetYM || (g.doneYM && g.doneYM <= g.targetYM) })); }
  function goalTimeline(state, ym, monthlySurplus) { const sim = simulateGoals(state, ym, monthlySurplus); const startIdx = ymIndex(ym); let maxIdx = startIdx; const rows = state.goals.slice().sort(goalSorter).map(g => { const s = sim.find(x => x.id === g.id); const doneYM = s ? s.doneYM : null; if (doneYM) maxIdx = Math.max(maxIdx, ymIndex(doneYM)); if (g.targetYM) maxIdx = Math.max(maxIdx, ymIndex(g.targetYM)); return { id: g.id, name: g.name, priority: g.priority || 3, target: g.target || 0, saved: g.saved || 0, targetYM: g.targetYM || null, doneYM, savedRatio: g.target ? Math.min(1, (g.saved || 0) / g.target) : 1, onTrack: s ? s.onTrack : true }; }); maxIdx = Math.min(maxIdx, startIdx + 36); const months = []; for (let i = startIdx; i <= maxIdx + 1; i++) months.push(idxToYM(i)); return { rows, months, startIdx, maxIdx: maxIdx + 1 }; }

  const UNIT_GROUP = { 総額: 'flat', g: 'weight', kg: 'weight', ml: 'volume', L: 'volume', 個: 'count', 本: 'count', 枚: 'count', 杯: 'count' };
  function normalizedUnitPrice(entry) { const price = +entry.price || 0; const qty = +entry.qty || 0; const u = entry.unit || '総額'; const grp = UNIT_GROUP[u] || 'flat'; if (grp === 'weight') { const g = qty * (u === 'kg' ? 1000 : 1); if (g <= 0) return null; return { value: price / g * 100, label: '¥/100g', basis: 'weight' }; } if (grp === 'volume') { const ml = qty * (u === 'L' ? 1000 : 1); if (ml <= 0) return null; return { value: price / ml * 100, label: '¥/100ml', basis: 'volume' }; } if (grp === 'count') { if (qty <= 0) return null; return { value: price / qty, label: '¥/' + u, basis: 'count:' + u }; } return { value: price, label: '¥(総額)', basis: 'flat' }; }
  function priceItems(state) { const map = {}; for (const e of (state.priceLogs || [])) { const k = e.item || '(無名)'; (map[k] || (map[k] = [])).push(e); } const items = Object.entries(map).map(([item, entries]) => { const enr = entries.map(e => ({ ...e, norm: normalizedUnitPrice(e) })).sort((a, b) => b.date.localeCompare(a.date)); const byBasis = {}; enr.forEach(e => { if (e.norm) (byBasis[e.norm.basis] || (byBasis[e.norm.basis] = [])).push(e); }); let best = null; Object.values(byBasis).forEach(arr => { arr.forEach(e => { if (!best || e.norm.value < best.norm.value) best = e; }); }); return { item, entries: enr, bestId: best ? best.id : null, count: enr.length, lastDate: enr.length ? enr[0].date : '' }; }); items.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.item.localeCompare(b.item, 'ja')); return items; }
  function addPriceLog(state, e) { const rec = { id: 'pl_' + Math.random().toString(36).slice(2, 8), item: e.item || '', date: e.date || todayStr(), store: e.store || '', branch: e.branch || '', price: +e.price || 0, qty: +e.qty || 0, unit: e.unit || '総額', note: e.note || '' }; state.priceLogs.push(rec); return rec; }
  function priceSeries(state, item, window) { window = window || 3; const entries = (state.priceLogs || []).filter(e => e.item === item).map(e => ({ ...e, norm: normalizedUnitPrice(e) })).filter(e => e.norm).sort((a, b) => a.date.localeCompare(b.date)); const cnt = {}; entries.forEach(e => cnt[e.norm.basis] = (cnt[e.norm.basis] || 0) + 1); const mainBasis = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (!mainBasis) return { points: [], label: '', basis: null }; const basis = mainBasis[0]; const label = (entries.find(e => e.norm.basis === basis) || {}).norm.label; const pts = entries.filter(e => e.norm.basis === basis).map(e => ({ date: e.date, store: e.store, value: e.norm.value, price: e.price, qty: e.qty, unit: e.unit })); for (let i = 0; i < pts.length; i++) { const s = Math.max(0, i - window + 1); let sum = 0; for (let j = s; j <= i; j++) sum += pts[j].value; pts[i].ma = sum / (i - s + 1); } return { points: pts, label, basis }; }

  function flattenCategories(catTree, kind) { const prefix = kind === 'income' ? 'inc' : 'exp'; const out = []; const root = kind === 'income' ? catTree.income : catTree.expense; for (const top of Object.keys(root)) { const mids = root[top]; if (!mids || Object.keys(mids).length === 0) { out.push(mk(prefix, [top])); continue; } for (const mid of Object.keys(mids)) { const leaves = mids[mid]; if (!leaves || leaves.length === 0) { out.push(mk(prefix, [top, mid])); continue; } for (const leaf of leaves) out.push(mk(prefix, [top, mid, leaf])); } } return out; function mk(pfx, parts) { return { path: pfx + '>' + parts.join('>'), label: parts.join(' › '), top: parts[0], mid: parts[1] || '', leaf: parts[2] || '' }; } }

  const CSV_COLS = ['id', 'date', 'kind', 'store', 'branch', 'memo', 'side', 'account', 'amount', 'qty'];
  const CSV_HEADER_JA = ['ID', '日付', '種別', '店名', '支店', 'メモ', '区分', '科目', '金額', '数量'];
  function csvQuote(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function refToAccount(state, ref) { if (ref.startsWith('acc:')) { const a = state.accounts.find(x => x.id === ref.slice(4)); return a ? a.name : ref.slice(4); } if (ref.startsWith('cat:')) return ref.slice(4).replace(/^exp>|^inc>/, '').split('>').join(' > '); return ref; }
  function serializeCSV(state) { const rows = [CSV_HEADER_JA.join(',')]; for (const t of state.transactions) { for (const ln of t.lines) { const side = ln.amount > 0 ? '借方' : '貸方'; const account = refToAccount(state, ln.ref); rows.push([t.id, t.date, t.kind, t.store, t.branch, t.memo, side, account, Math.abs(ln.amount), (ln.qty != null ? Math.abs(ln.qty) : '')].map(csvQuote).join(',')); } } return rows.join('\r\n'); }
  function csvToRows(text) { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else { if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; } else cur += ch; } } if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== '')); }
  function accountToRef(state, account, kind) { const acc = state.accounts.find(a => a.name === account); if (acc) return 'acc:' + acc.id; const parts = account.split(/\s*>\s*/).filter(Boolean); const isInc = kind === 'income' || Object.keys(state.categories.income).includes(parts[0]); return 'cat:' + (isInc ? 'inc>' : 'exp>') + parts.join('>'); }
  function parseCSV(text, state) { const rows = csvToRows(text); if (!rows.length) return []; const header = rows[0]; const idx = {}; CSV_COLS.forEach((c, i) => { let p = header.indexOf(c); if (p < 0) p = header.indexOf(CSV_HEADER_JA[i]); idx[c] = p; }); const groups = new Map(); const order = []; for (let r = 1; r < rows.length; r++) { const cells = rows[r]; const get = c => idx[c] >= 0 ? (cells[idx[c]] || '') : ''; const id = get('id') || ('t_' + Math.random().toString(36).slice(2, 10)); if (!groups.has(id)) { groups.set(id, { id, date: get('date'), kind: get('kind') || 'generic', store: get('store'), branch: get('branch'), memo: get('memo'), lines: [], meta: null }); order.push(id); } const g = groups.get(id); const side = get('side'); const account = get('account'); const amountAbs = Math.abs(+get('amount') || 0); const qtyRaw = get('qty'); const signed = (side === '貸方' || side === 'credit') ? -amountAbs : amountAbs; const ref = accountToRef(state, account, g.kind === 'income' ? 'income' : 'expense'); const l = { ref, amount: signed }; if (qtyRaw !== '' && qtyRaw != null) { const q = Math.abs(+qtyRaw); l.qty = signed < 0 ? -q : q; } g.lines.push(l); } return order.map(id => groups.get(id)); }
  function mergeTransactions(existing, incoming, mode) { if (mode === 'replace') return { list: incoming.slice(), added: incoming.length, updated: 0, kept: 0 }; const map = new Map(existing.map(t => [t.id, t])); let added = 0, updated = 0, kept = 0; for (const t of incoming) { if (map.has(t.id)) { if (mode === 'overwrite') { map.set(t.id, t); updated++; } else kept++; } else { map.set(t.id, t); added++; } } return { list: [...map.values()], added, updated, kept }; }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
  function pct(part, whole) { return whole > 0 ? Math.round(part / whole * 100) : 0; }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function curYM() { return new Date().toISOString().slice(0, 7); }

  function makeDummy() {
    const s = initialState();
    s.accounts = [
      { id: 'a_cash', name: '現金', subtype: 'cash', opening: 25000 }, { id: 'a_bank', name: '銀行(メイン)', subtype: 'bank', opening: 420000 }, { id: 'a_saving', name: '貯蓄用口座', subtype: 'bank', opening: 150000 },
      { id: 'a_rcard', name: '楽天カード', subtype: 'card', opening: 0, card: { closingDay: 99, payDay: 27, payMonthsAfter: 1 } }, { id: 'a_suica', name: 'Suica', subtype: 'transit', opening: 0 },
      { id: 'a_rpt', name: '楽天ポイント', subtype: 'point', opening: 1800 }, { id: 'a_waon', name: 'WAON', subtype: 'emoney', opening: 3000 }, { id: 'a_book', name: '図書カード', subtype: 'voucher_amount', opening: 0 }, { id: 'a_cof', name: 'コーヒー11枚券', subtype: 'voucher_goods', opening: 0, goods: { openingQty: 0 } },
    ];
    s.recurring = [
      { id: 'r_rent', name: '家賃', dayOfMonth: 2, active: true, lastApplied: '2026-08', intervalMonths: 1, anchorYM: null, bizAdjust: 'none', builder: 'expense', params: { catPath: 'exp>住居>家賃', amount: 78000, accId: 'a_bank' } },
      { id: 'r_mobile', name: '楽天モバイル', dayOfMonth: 20, active: true, lastApplied: '2026-07', intervalMonths: 1, anchorYM: null, bizAdjust: 'none', builder: 'expense', params: { catPath: 'exp>通信費>携帯', amount: 2980, accId: 'a_rcard' } },
      { id: 'r_sub', name: 'Adobe CC', dayOfMonth: 11, active: true, lastApplied: '2026-07', intervalMonths: 1, anchorYM: null, bizAdjust: 'none', builder: 'expense', params: { catPath: 'exp>趣味・娯楽>サブスク', amount: 1580, accId: 'a_rcard' } },
      { id: 'r_water', name: '水道代(隔月)', dayOfMonth: 15, active: true, lastApplied: '2026-06', intervalMonths: 2, anchorYM: '2026-06', bizAdjust: 'next', builder: 'expense', params: { catPath: 'exp>水道光熱費>水道', amount: 4200, accId: 'a_bank' } },
      { id: 'r_salary', name: '給与', dayOfMonth: 25, active: true, lastApplied: '2026-07', intervalMonths: 1, anchorYM: null, bizAdjust: 'prev', builder: 'income', params: { catPath: 'inc>給与', amount: 285000, accId: 'a_bank' } },
    ];
    s.budgets = { 'exp>食費': 45000, 'exp>食費>外食': 12000, 'exp>日用品': 6000, 'exp>趣味・娯楽': 8000, 'exp>交際費': 10000 };
    s.goals = [
      { id: 'g_mac', name: 'Mac Studio 買い替え', target: 350000, targetYM: '2027-03', saved: 60000, priority: 1, note: '開発＆音楽制作用', linkedAccId: 'a_saving' },
      { id: 'g_trip', name: '旅行(冬)', target: 120000, targetYM: '2026-12', saved: 30000, priority: 2, note: '年末の旅行', linkedAccId: null },
      { id: 'g_emg', name: '緊急予備資金', target: 500000, targetYM: null, saved: 150000, priority: 3, note: '生活防衛費', linkedAccId: 'a_saving' },
    ];
    s.wishlist = [
      { id: 'w_hp', name: 'ヘッドホン(密閉型)', price: 35000, desiredYM: '2026-11', priority: 2, note: 'モニター用', goalId: null, tags: ['ネットで買う', 'ガジェット'], status: 'active', store: '', url: '' },
      { id: 'w_chair', name: 'ワークチェア', price: 60000, desiredYM: '2027-02', priority: 3, note: '腰対策', goalId: null, tags: ['高額', '実店舗で試す'], status: 'active', store: '', url: '' },
      { id: 'w_knife', name: '包丁(三徳)', price: 8000, desiredYM: '2026-09', priority: 1, note: '', goalId: null, tags: ['ニトリで', 'キッチン'], status: 'active', store: 'ニトリ', url: '' },
      { id: 'w_spice', name: 'クミンパウダー', price: 400, desiredYM: null, priority: 4, note: 'カレー用', goalId: null, tags: ['スーパーで', '食材'], status: 'active', store: '', url: '' },
      { id: 'w_book', name: 'DSPの本', price: 4200, desiredYM: '2026-10', priority: 3, note: '', goalId: null, tags: ['ネットで買う', '書籍'], status: 'done', store: '', url: '' },
    ];
    s.priceLogs = [
      { id: 'pl_1', item: '卵(10個)', date: '2026-08-03', store: 'スーパーマルエツ', branch: '駅前店', price: 248, qty: 10, unit: '個', note: '' },
      { id: 'pl_2', item: '卵(10個)', date: '2026-08-08', store: 'イオン', branch: '本店', price: 268, qty: 10, unit: '個', note: 'Lサイズ' },
      { id: 'pl_3', item: '牛乳', date: '2026-06-05', store: 'スーパーマルエツ', branch: '駅前店', price: 218, qty: 1000, unit: 'ml', note: '' },
      { id: 'pl_3c', item: '牛乳', date: '2026-07-06', store: 'スーパーマルエツ', branch: '駅前店', price: 212, qty: 1000, unit: 'ml', note: '' },
      { id: 'pl_3e', item: '牛乳', date: '2026-08-03', store: 'スーパーマルエツ', branch: '駅前店', price: 208, qty: 1000, unit: 'ml', note: '' },
      { id: 'pl_4', item: '牛乳', date: '2026-08-08', store: 'イオン', branch: '本店', price: 178, qty: 1000, unit: 'ml', note: '特売' },
      { id: 'pl_5', item: '鶏むね肉', date: '2026-08-03', store: 'スーパーマルエツ', branch: '駅前店', price: 580, qty: 600, unit: 'g', note: '' },
      { id: 'pl_6', item: '鶏むね肉', date: '2026-08-10', store: '肉のハナマサ', branch: '', price: 780, qty: 1, unit: 'kg', note: '業務用' },
    ];
    s.templates = [
      { id: 'tpl_1', name: 'いつものスーパー(食材)', store: 'スーパーマルエツ', branch: '駅前店', creditAccId: 'a_cash', padMode: 'receipt', items: [{ catPath: 'exp>食費>食材>肉・魚', amount: 0 }, { catPath: 'exp>食費>食材>野菜・果物', amount: 0 }, { catPath: 'exp>食費>食材>主食', amount: 0 }] },
      { id: 'tpl_2', name: 'コンビニ弁当', store: '', branch: '', creditAccId: 'a_cash', padMode: 'calc', items: [{ catPath: 'exp>食費>中食>惣菜・弁当', amount: 0 }] },
      { id: 'tpl_3', name: 'ランチ(カード)', store: '定食屋つくし', branch: '', creditAccId: 'a_rcard', padMode: 'calc', items: [{ catPath: 'exp>食費>外食>ランチ', amount: 0 }] },
    ];
    s.readings = { 'スーパーマルエツ': 'すーぱーまるえつ', 'イオン': 'いおん', '肉のハナマサ': 'にくのはなまさ', '喫茶マチ': 'きっさまち', '定食屋つくし': 'ていしょくやつくし', '居酒屋とり平': 'いざかやとりへい', '紀伊國屋書店': 'きのくにやしょてん', '牛乳': 'ぎゅうにゅう', '鶏むね肉': 'とりむねにく', '卵(10個)': 'たまご' };
    const T = []; const P = (...a) => T.push(...a);
    P(buildTransfer({ date: '2026-06-01', fromAccId: 'a_bank', toAccId: 'a_cash', amount: 40000, store: '銀行ATM', memo: '生活費引き出し' }));
    P(buildTransfer({ date: '2026-07-01', fromAccId: 'a_bank', toAccId: 'a_cash', amount: 30000, store: '銀行ATM', memo: '生活費引き出し' }));
    P(buildTransfer({ date: '2026-08-01', fromAccId: 'a_bank', toAccId: 'a_cash', amount: 30000, store: '銀行ATM', memo: '生活費引き出し' }));
    P(buildIncome({ date: '2026-06-25', accId: 'a_bank', catPath: 'inc>給与', amount: 285000, store: '勤務先' }));
    P(buildExpense({ date: '2026-06-02', catPath: 'exp>住居>家賃', amount: 78000, credits: [{ accId: 'a_bank', amount: 78000 }], store: '管理会社' }));
    P(buildExpense({ date: '2026-06-05', items: [{ catPath: 'exp>食費>食材>野菜・果物', amount: 820 }, { catPath: 'exp>食費>食材>肉・魚', amount: 1340 }, { catPath: 'exp>食費>食材>主食', amount: 560 }], credits: [{ accId: 'a_cash', amount: 2720 }], store: 'スーパーマルエツ', branch: '駅前店' }));
    P(buildExpense({ date: '2026-06-08', catPath: 'exp>食費>外食>ランチ', amount: 1100, credits: [{ accId: 'a_rcard', amount: 1100 }], store: '定食屋つくし' }));
    P(buildExpense({ date: '2026-06-11', catPath: 'exp>趣味・娯楽>サブスク', amount: 1580, credits: [{ accId: 'a_rcard', amount: 1580 }], store: 'Adobe' }));
    P(buildTransfer({ date: '2026-06-14', fromAccId: 'a_cash', toAccId: 'a_waon', amount: 5000, store: 'イオン', branch: '本店', memo: 'WAONチャージ' }));
    P(buildExpense({ date: '2026-06-14', items: [{ catPath: 'exp>食費>食材>野菜・果物', amount: 640 }, { catPath: 'exp>日用品>消耗品', amount: 980 }], credits: [{ accId: 'a_waon', amount: 1620 }], store: 'イオン', branch: '本店' }));
    P(buildExpense({ date: '2026-06-22', catPath: 'exp>水道光熱費>電気', amount: 6200, credits: [{ accId: 'a_bank', amount: 6200 }], store: '東京電力' }));
    P(buildIncome({ date: '2026-07-25', accId: 'a_bank', catPath: 'inc>給与', amount: 285000, store: '勤務先' }));
    P(buildCardPayment({ date: '2026-07-27', cardAccId: 'a_rcard', bankAccId: 'a_bank', amount: 2680, cycleKey: '2026-06', payDate: '2026-07-27' }));
    P(buildExpense({ date: '2026-07-02', catPath: 'exp>住居>家賃', amount: 78000, credits: [{ accId: 'a_bank', amount: 78000 }], store: '管理会社' }));
    P(buildExpense({ date: '2026-07-06', items: [{ catPath: 'exp>食費>食材>肉・魚', amount: 1580 }, { catPath: 'exp>食費>食材>野菜・果物', amount: 720 }, { catPath: 'exp>食費>食材>乳・卵', amount: 430 }], credits: [{ accId: 'a_cash', amount: 1930 }, { accId: 'a_rpt', amount: 800 }], store: 'スーパーマルエツ', branch: '駅前店' }));
    P(buildExpense({ date: '2026-07-10', catPath: 'exp>食費>外食>ディナー', amount: 3600, credits: [{ accId: 'a_rcard', amount: 3600 }], store: '居酒屋とり平' }));
    P(buildIncome({ date: '2026-07-25', accId: 'a_rpt', catPath: 'inc>ポイント獲得', amount: 420, store: '楽天' }));
    P(buildExpense({ date: '2026-07-20', catPath: 'exp>通信費>携帯', amount: 2980, credits: [{ accId: 'a_rcard', amount: 2480 }, { accId: 'a_rpt', amount: 500 }], store: '楽天モバイル', memo: 'ポイント一部充当' }));
    P(buildExpense({ date: '2026-08-02', catPath: 'exp>住居>家賃', amount: 78000, credits: [{ accId: 'a_bank', amount: 78000 }], store: '管理会社' }));
    P(buildIncome({ date: '2026-08-25', accId: 'a_bank', catPath: 'inc>給与', amount: 285000, store: '勤務先' }));
    P(buildExpense({ date: '2026-08-03', items: [{ catPath: 'exp>食費>食材>肉・魚', amount: 1420 }, { catPath: 'exp>食費>食材>野菜・果物', amount: 880 }, { catPath: 'exp>食費>食材>調味料・油', amount: 520 }], credits: [{ accId: 'a_cash', amount: 2820 }], store: 'スーパーマルエツ', branch: '駅前店' }));
    P(buildExpense({ date: '2026-08-05', catPath: 'exp>食費>外食>ランチ', amount: 1250, credits: [{ accId: 'a_rcard', amount: 1250 }], store: '定食屋つくし' }));
    P(buildExpense({ date: '2026-08-09', catPath: 'exp>趣味・娯楽>書籍', amount: 1200, credits: [{ accId: 'a_book', amount: 1200 }], store: '紀伊國屋書店', branch: '新宿本店' }));
    P(buildExpense({ date: '2026-08-10', catPath: 'exp>交際費>飲み会', amount: 4200, credits: [{ accId: 'a_rcard', amount: 4200 }], store: '居酒屋とり平' }));
    P(buildIncome({ date: '2026-08-15', accId: 'a_bank', catPath: 'inc>副収入', amount: 25000, store: '副業' }));
    s.transactions = T; s.meta.dummy = true;
    return s;
  }

  const Model = {
    ACCOUNT_SUBTYPES, DEFAULT_CATEGORIES, UNIT_GROUP,
    initialState, defaultAccounts, makeDummy, migrate,
    toHankaku, normReading, matchCandidates,
    jpHolidays, isHoliday, holidayName, isBusinessDay, adjustBusinessDay,
    accountBalance, goodsQty, monthlySummary, expenseByTopCategory, incomeByTopCategory, trailingMonths,
    drillCategory, transactionsForCategory,
    cardCloseInfo, cardCycles,
    storeCategoryStats, storeBranchDefault, lastStoreComposition, evalAmount, validateTransaction,
    buildMulti, buildExpense, buildIncome, buildTransfer, buildCardPayment, buildPrepaidAmount, buildPrepaidGoods, buildGoodsUse,
    pendingRecurring, recMonthsBetween, recOccursIn, recDate, buildFromRecurring, ymIndex, idxToYM,
    budgetSpent, budgetReport, budgetForCategory, budgetableCategories, budgetCarry,
    avgMonthlySurplus, goalMonthsRemaining, goalRequiredMonthly, goalProjectedYM, simulateGoals, goalTimeline,
    normalizedUnitPrice, priceItems, addPriceLog, priceSeries,
    flattenCategories, serializeCSV, parseCSV, mergeTransactions,
    deepClone, yen, pct, todayStr, curYM, catKindOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(typeof window !== 'undefined' ? window : this);
