/* =====================================================================
 * cloud.js ― 認証 + StorageAdapter(Supabase) + ログイン画面制御 + PWA
 * ===================================================================== */
(function () {
  'use strict';
  const CFG = window.KAKEIBO_CONFIG || {};
  const LS_KEY = 'kakeibo_v0_state';
  const TABLE = CFG.table || 'kakeibo_state';
  let supa = null, currentUser = null, cachedState = null, appLoaded = false;

  const $ = s => document.querySelector(s);
  function setSync(status, msg) {
    const el = $('#syncStatus'); if (!el) return;
    const map = { saving: ['●', '同期中…', 'var(--warn)'], saved: ['●', '同期済み', 'var(--accent2)'], error: ['●', '同期エラー', 'var(--danger)'], local: ['●', 'ローカル', 'var(--muted)'], offline: ['●', 'オフライン', 'var(--muted)'] };
    const m = map[status] || map.saved; el.style.color = m[2]; el.textContent = m[0] + ' ' + (msg || m[1]);
  }
  function showAccountBar(user) {
    const bar = $('#accountBar'); if (!bar) return;
    if (user) bar.innerHTML = `<span id="syncStatus" class="acc-sub"></span><span class="acc-sub acc-mail">${escapeHtml(user.email || 'ログイン中')}</span><button class="btn ghost sm" id="btnLogout">ログアウト</button>`;
    else bar.innerHTML = `<span id="syncStatus" class="acc-sub"></span><span class="acc-sub">ローカルモード</span><button class="btn ghost sm" id="btnLoginOpen">ログイン</button>`;
    const lo = $('#btnLogout'); if (lo) lo.addEventListener('click', doLogout);
    const li = $('#btnLoginOpen'); if (li) li.addEventListener('click', () => showLogin());
    setSync(user ? 'saved' : 'local');
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let pushTimer = null;
  function makeAdapter() {
    return {
      name: 'cloud',
      load() { return cachedState; },
      save(state) { cachedState = state; try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } schedulePush(state); return true; },
      clear() { try { localStorage.removeItem(LS_KEY); } catch (e) { } },
    };
  }
  function schedulePush(state) { if (!supa || !currentUser) { setSync('local'); return; } clearTimeout(pushTimer); setSync('saving'); pushTimer = setTimeout(() => pushNow(state), 900); }
  async function pushNow(state) { if (!supa || !currentUser) return; try { const { error } = await supa.from(TABLE).upsert({ user_id: currentUser.id, data: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); setSync(error ? 'error' : 'saved', error ? ('同期エラー: ' + error.message) : null); if (error) console.error('push error', error); } catch (e) { setSync('error'); console.error(e); } }

  function injectApp() { if (appLoaded) return; appLoaded = true; window.StorageAdapter = makeAdapter(); const s = document.createElement('script'); s.src = 'app.js'; document.body.appendChild(s); }

  function showLogin() { const o = $('#authOverlay'); if (o) { o.classList.add('show'); $('#authEmail') && $('#authEmail').focus(); } }
  function hideLogin() { const o = $('#authOverlay'); if (o) o.classList.remove('show'); }
  function authMsg(t, isErr) { const m = $('#authMsg'); if (m) { m.textContent = t || ''; m.style.color = isErr ? 'var(--danger)' : 'var(--muted)'; } }

  async function doLogin() { const email = ($('#authEmail').value || '').trim(); const pw = $('#authPass').value || ''; if (!email || !pw) return authMsg('メールとパスワードを入力してください', true); authMsg('ログイン中…'); const { data, error } = await supa.auth.signInWithPassword({ email, password: pw }); if (error) return authMsg('ログイン失敗: ' + error.message, true); await onAuthed(data.user); }
  async function doSignup() { const email = ($('#authEmail').value || '').trim(); const pw = $('#authPass').value || ''; if (!email || pw.length < 6) return authMsg('メールと6文字以上のパスワードを入力してください', true); authMsg('アカウント作成中…'); const { data, error } = await supa.auth.signUp({ email, password: pw }); if (error) return authMsg('作成失敗: ' + error.message, true); if (data.session) { await onAuthed(data.user); } else { authMsg('確認メールを送信しました。メール内のリンクを開いてから、もう一度ログインしてください。'); } }
  async function doLogout() { if (!supa) return; if (!confirm('ログアウトします。よろしいですか？（データはクラウドに保存済みです）')) return; try { await supa.auth.signOut(); } catch (e) { } location.reload(); }
  window.KakeiboCloud = { signOut: doLogout, showLogin, isCloud: () => !!currentUser };

  // Treat a failed cloud read as a hard stop, never as an empty account.
  function cloudLoadFailed(error) {
    console.error('cloud load error', error);
    setSync('error', '読込失敗・保存停止');
    const bar = $('#accountBar');
    if (bar && !bar.querySelector('#btnRetryCloud')) {
      const button = document.createElement('button');
      button.id = 'btnRetryCloud';
      button.className = 'btn ghost sm';
      button.textContent = '再読込';
      button.addEventListener('click', () => location.reload());
      bar.appendChild(button);
    }
  }
  async function onAuthed(user) {
    currentUser = user; hideLogin(); showAccountBar(user); setSync('saving', '読込中…');
    try {
      const { data, error } = await supa.from(TABLE).select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (data) {
        // A present-but-empty row is not the same as an account with no row.
        if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data) || !Object.keys(data.data).length)
          throw new Error('クラウドに不正な空データがあります');
        cachedState = data.data;
        setSync('saved');
      } else {
        // First use only: insert rather than upsert so a concurrent login cannot overwrite a row.
        const ls = localStorage.getItem(LS_KEY);
        cachedState = ls ? safeParse(ls) : null;
        if (cachedState) {
          const { error: migrationError } = await supa.from(TABLE).insert({
            user_id: user.id, data: cachedState, updated_at: new Date().toISOString()
          });
          if (migrationError) throw migrationError;
          setSync('saved', 'ローカルデータを移行しました');
        } else setSync('saved', '新規');
      }
      injectApp();
    } catch (error) {
      // Do not start the editable app when the server state is unknown.
      cachedState = null;
      cloudLoadFailed(error);
    }
  }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function localMode(reason) { const ls = localStorage.getItem(LS_KEY); cachedState = ls ? safeParse(ls) : null; showAccountBar(null); setSync(reason === 'offline' ? 'offline' : 'local'); injectApp(); }

  async function init() {
    if (!window.supabase || !CFG.url || !CFG.key) { console.warn('Supabase未使用 → ローカルモード'); localMode('local'); return; }
    try { supa = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } }); } catch (e) { console.error('createClient失敗', e); localMode('local'); return; }
    try { const { data: { session } } = await supa.auth.getSession(); if (session && session.user) { await onAuthed(session.user); } else showLogin(); } catch (e) { console.error('getSession失敗', e); showLogin(); }
    supa.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { } });
    const lb = $('#authLogin'); if (lb) lb.addEventListener('click', doLogin);
    const sb = $('#authSignup'); if (sb) sb.addEventListener('click', doSignup);
    const pf = $('#authPass'); if (pf) pf.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }
  function registerSW() { if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW登録失敗', e)); } }
  document.addEventListener('DOMContentLoaded', () => { init(); registerSW(); });
})();
