/* config.js ― Supabase 接続設定（公開してよい値のみ） */

/* ui-refresh branch: keep the visual experiment isolated from main.
 * This loader can be removed once the refreshed stylesheet is folded into
 * the normal document head during final integration. */
if (!document.querySelector('link[data-ui-refresh]')) {
  const uiRefresh = document.createElement('link');
  uiRefresh.rel = 'stylesheet';
  uiRefresh.href = 'ui-refresh.css';
  uiRefresh.dataset.uiRefresh = '1';
  document.head.appendChild(uiRefresh);
}

window.KAKEIBO_CONFIG = {
  url: 'https://nbbdwsfjdrwwyoiqywvj.supabase.co',
  key: 'sb_publishable_fm43Fm2Le_S2ahtBQC5PCw_wl6B_1e8',
  table: 'kakeibo_state',
};
