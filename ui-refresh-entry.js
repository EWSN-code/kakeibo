/* =====================================================================
 * ui-refresh-entry.js — progressive entry UI for v1.8.0-ui.2
 *
 * New entries keep frequently used date/store/branch fields visible.
 * Purchase total and memo stay available but are disclosed on demand.
 * Edit mode expands the optional fields automatically.
 * ===================================================================== */
(function () {
  'use strict';

  const VERSION = 'v1.8.0-ui.2';
  const $ = (s, r = document) => r.querySelector(s);

  function updateVersionLabel() {
    document.title = `家計簿 ${VERSION} ― 複式簿記ハイブリッド`;
    const version = $('header.top .brand small');
    if (version) version.textContent = VERSION;
  }

  function isEditing() {
    const submit = $('#entryForm #submit');
    return !!(submit && /更新/.test(submit.textContent || ''));
  }

  function shiftDate(input, days) {
    if (!input || !input.value) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.value);
    if (!m) return;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    input.value = `${y}-${mo}-${da}`;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enhanceDateNavigation(host) {
    const input = $('#f_date', host);
    const wrap = input && input.closest('.date-wrap');
    if (!input || !wrap || wrap.dataset.uiEntryDate === '1') return;
    wrap.dataset.uiEntryDate = '1';
    wrap.classList.add('ui-entry-date-nav');

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'ui-date-step';
    prev.setAttribute('aria-label', '前日');
    prev.title = '前日';
    prev.textContent = '‹';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'ui-date-step';
    next.setAttribute('aria-label', '翌日');
    next.title = '翌日';
    next.textContent = '›';

    wrap.insertBefore(prev, input);
    input.insertAdjacentElement('afterend', next);
    prev.addEventListener('click', () => shiftDate(input, -1));
    next.addEventListener('click', () => shiftDate(input, 1));
  }

  function makeDisclosure(options) {
    const { anchor, targets, label, initiallyOpen } = options;
    if (!anchor || !targets.length || anchor.dataset.uiDisclosure === '1') return;
    anchor.dataset.uiDisclosure = '1';

    const control = document.createElement('div');
    control.className = 'ui-entry-disclosure';
    const button = document.createElement('button');
    button.type = 'button';
    control.appendChild(button);
    anchor.parentNode.insertBefore(control, anchor);

    const setOpen = open => {
      control.classList.toggle('open', open);
      control.dataset.open = open ? '1' : '0';
      button.textContent = open ? `${label}を閉じる` : label;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      targets.forEach(el => {
        el.hidden = !open;
        el.classList.add('ui-entry-optional');
      });
    };

    button.addEventListener('click', () => setOpen(control.dataset.open !== '1'));
    setOpen(!!initiallyOpen);
  }

  function enhanceOptionalFields(host) {
    const editing = isEditing();

    const total = $('#f_total', host);
    if (total) {
      const field = total.closest('.field');
      const alloc = $('#allocTools', host);
      const targets = [field, alloc].filter(Boolean);
      makeDisclosure({
        anchor: field,
        targets,
        label: '購入合計を指定',
        initiallyOpen: editing || String(total.value || '').trim() !== ''
      });
    }

    const memo = $('#f_memo', host);
    if (memo) {
      const field = memo.closest('.field');
      makeDisclosure({
        anchor: field,
        targets: field ? [field] : [],
        label: 'メモを追加',
        initiallyOpen: editing || String(memo.value || '').trim() !== ''
      });
    }
  }

  function enhanceEntryForm() {
    const host = $('#entryForm');
    if (!host || !host.children.length) return false;
    enhanceDateNavigation(host);
    enhanceOptionalFields(host);
    updateVersionLabel();
    return true;
  }

  function init() {
    updateVersionLabel();
    enhanceEntryForm();

    const host = $('#entryForm');
    if (host) {
      let scheduled = false;
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          enhanceEntryForm();
        });
      }).observe(host, { childList: true, subtree: true });
    }

    /* cloud.js injects app.js asynchronously, so the form may not exist at
       DOMContentLoaded. Stop polling once the app has rendered it. */
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (enhanceEntryForm() || tries > 80) clearInterval(timer);
    }, 125);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
