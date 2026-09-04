// ==UserScript==
// @name         昇腾 / 鲲鹏社区集成增强
// @namespace    https://github.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript
// @version      2.1.0
// @description  昇腾与鲲鹏社区集成增强：自动恢复登录、每日签到、积分提醒、库存过滤与比赛提交协议自动勾选。
// @author       KaranocaVe
// @downloadURL  https://raw.githubusercontent.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript/main/hiascend-hikunpeng-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript/main/hiascend-hikunpeng-enhancer.user.js
// @match        https://www.hiascend.com/*
// @match        https://www.hikunpeng.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self || window.__hiascendKunpengEnhancerInstalled) return;
  window.__hiascendKunpengEnhancerInstalled = true;

  const PLATFORM = location.hostname.includes('hikunpeng')
    ? {
      id: 'hikunpeng',
      name: '鲲鹏社区',
      apiBase: '/kunpenggateway/kunpengservice',
      accountPath: '/kunpenggateway/hwaccount/getUserInfo',
      signInPath: '/kunpenggateway/kunpengservice/devCenter/userCheckIn/monthlySignIn',
      giftListPath: '/kunpenggateway/kunpengservice/exchange/center/gift/list',
    }
    : {
      id: 'hiascend',
      name: '昇腾社区',
      apiBase: '/ascendgateway/ascendservice',
      accountPath: '/ascendgateway/hwaccount/getUserInfo',
      signInPath: '/ascendgateway/ascendservice/devCenter/userCheckIn/as/monthlySignIn',
      giftListPath: '/ascendgateway/ascendservice/exchange/center/gift/list',
    };

  const SCRIPT_KEY = 'hiascend-kunpeng-enhancer:v2';
  const DEFAULT_SETTINGS = Object.freeze({
    autoRelogin: true,
    nativeLoginFallback: true,
    autoCheckIn: true,
    signInNotifications: false,
    pointNotifications: true,
    pointPollMinutes: 5,
    replacePointsLink: true,
    filterSoldOutGifts: true,
    contestAgreementAutoCheck: true,
  });
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    lastPoints: null,
    pollTimer: null,
    polling: false,
    domObserver: null,
  };

  const settingStorageKey = (name) => `${SCRIPT_KEY}:setting:${name}`;
  const dataStorageKey = (name) => `${SCRIPT_KEY}:${PLATFORM.id}:${name}`;

  const gmGet = async (key, fallback) => {
    try {
      return await GM_getValue(key, fallback);
    } catch (_) {
      return fallback;
    }
  };

  const gmSet = async (key, value) => {
    try {
      await GM_setValue(key, value);
    } catch (error) {
      console.warn('[HK enhancer] cannot save setting:', error);
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeText = (value) => String(value || '').replace(/\s+/g, '').trim();
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  async function loadSettings() {
    const entries = await Promise.all(Object.entries(DEFAULT_SETTINGS).map(async ([name, fallback]) => [
      name,
      await gmGet(settingStorageKey(name), fallback),
    ]));
    const loaded = Object.fromEntries(entries);
    return {
      ...DEFAULT_SETTINGS,
      ...loaded,
      pointPollMinutes: clampPollMinutes(loaded.pointPollMinutes),
    };
  }

  function clampPollMinutes(value) {
    const number = Number(value);
    return [1, 2, 5, 10, 15, 30].includes(number) ? number : DEFAULT_SETTINGS.pointPollMinutes;
  }

  async function saveSettings(nextSettings) {
    const normalized = {
      ...DEFAULT_SETTINGS,
      ...nextSettings,
      pointPollMinutes: clampPollMinutes(nextSettings.pointPollMinutes),
    };
    await Promise.all(Object.entries(normalized).map(([name, value]) => gmSet(settingStorageKey(name), value)));
    state.settings = normalized;
  }

  function addStyles() {
    const css = `
      #hk-enhancer-toast { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
        max-width: min(360px, calc(100vw - 40px)); padding: 12px 16px; border-radius: 8px;
        color: #fff; background: rgba(27, 31, 42, .95); box-shadow: 0 8px 28px rgba(0,0,0,.28);
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; opacity: 0;
        transform: translateY(8px); transition: opacity .2s, transform .2s; }
      #hk-enhancer-toast.is-visible { opacity: 1; transform: translateY(0); }
      #hk-enhancer-settings { position: fixed; inset: 0; z-index: 2147483647; display: grid;
        place-items: center; padding: 20px; background: rgba(0, 0, 0, .44); color: #1d2129;
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #hk-enhancer-settings .hk-panel { width: min(620px, 100%); max-height: calc(100vh - 40px);
        overflow: auto; border-radius: 12px; background: #fff; box-shadow: 0 20px 64px rgba(0,0,0,.3); }
      #hk-enhancer-settings header { display:flex; align-items:center; justify-content:space-between;
        padding: 18px 22px 12px; border-bottom: 1px solid #e5e6eb; }
      #hk-enhancer-settings h2 { margin: 0; font-size: 18px; }
      #hk-enhancer-settings .hk-close { border: 0; background: transparent; color: #4e5969; font-size: 26px;
        line-height: 1; cursor: pointer; }
      #hk-enhancer-settings form { padding: 8px 22px 18px; }
      #hk-enhancer-settings .hk-row { display:grid; grid-template-columns: auto 1fr; gap: 12px;
        align-items:start; padding: 14px 0; border-bottom: 1px solid #f2f3f5; cursor:pointer; }
      #hk-enhancer-settings .hk-row input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: #c7000b; }
      #hk-enhancer-settings .hk-row strong { display:block; color:#1d2129; font-weight:600; }
      #hk-enhancer-settings .hk-row small, #hk-enhancer-settings .hk-note { display:block; margin-top:3px; color:#86909c; }
      #hk-enhancer-settings .hk-select-row { display:flex; gap:12px; align-items:center; padding:14px 0; }
      #hk-enhancer-settings select { border:1px solid #c9cdd4; border-radius:6px; padding:6px 8px; background:#fff; }
      #hk-enhancer-settings footer { display:flex; justify-content:flex-end; gap:10px; padding-top:18px; }
      #hk-enhancer-settings button.hk-secondary, #hk-enhancer-settings button.hk-primary { border:0; border-radius:6px;
        padding:8px 14px; cursor:pointer; font-weight:600; }
      #hk-enhancer-settings button.hk-secondary { background:#f2f3f5; color:#4e5969; }
      #hk-enhancer-settings button.hk-primary { background:#c7000b; color:#fff; }
      @media (max-width: 520px) { #hk-enhancer-settings { padding: 10px; } #hk-enhancer-settings header,
        #hk-enhancer-settings form { padding-left: 16px; padding-right: 16px; } }
    `;
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
      return;
    }
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function showToast(message) {
    const render = () => {
      let toast = document.getElementById('hk-enhancer-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'hk-enhancer-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('is-visible');
      clearTimeout(toast.__hkEnhancerTimeout);
      toast.__hkEnhancerTimeout = setTimeout(() => toast.classList.remove('is-visible'), 3500);
    };
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  function notify(title, text, enabled = true) {
    if (!enabled) return;
    if (typeof GM_notification === 'function') {
      GM_notification({ title, text, timeout: 10_000, silent: false });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: text });
    }
  }

  async function requestJson(path, init = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      ...init,
      headers: {
        accept: 'application/json, text/plain, */*',
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      // The official account endpoint can return a non-JSON response during an SSO redirect.
    }
    return { response, payload };
  }

  function isSuccess(payload) {
    return Number(payload?.code) === 200 && payload?.success !== false;
  }

  function getPoints(payload) {
    const points = Number(payload?.data?.points);
    return Number.isFinite(points) ? points : null;
  }

  function pointStorageKey() {
    return dataStorageKey('last-points');
  }

  function chinaDay() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  function replaceHeaderPoints(points) {
    if (!state.settings.replacePointsLink) return;
    const candidates = [...document.querySelectorAll('a, button, [role="link"]')]
      .filter((element) => isVisible(element))
      .filter((element) => {
        const compact = normalizeText(element.textContent).replace(/^积分：\d+(?:\.\d+)?$/, '积分兑换');
        return compact === '积分兑换' || compact === '积分兑换NEW';
      })
      .sort((left, right) => {
        const l = left.getBoundingClientRect();
        const r = right.getBoundingClientRect();
        const lHeader = left.closest('header, nav, [class*="header" i], [class*="nav" i]') ? 0 : 1;
        const rHeader = right.closest('header, nav, [class*="header" i], [class*="nav" i]') ? 0 : 1;
        return lHeader - rHeader || l.top - r.top || r.left - l.left;
      });

    const target = candidates[0];
    if (!target || target.dataset.hkEnhancerPoints === String(points)) return;
    target.textContent = `积分：${points}`;
    target.title = `积分兑换（当前 ${points} 积分）`;
    target.dataset.hkEnhancerPoints = String(points);
  }

  async function rememberAndNotifyPoints(points) {
    state.lastPoints = points;
    replaceHeaderPoints(points);
    const previous = await gmGet(pointStorageKey(), null);
    const previousPoints = Number(previous);
    if (Number.isFinite(previousPoints) && points > previousPoints) {
      notify(
        `${PLATFORM.name}积分增加`,
        `积分 +${points - previousPoints}，当前共 ${points} 积分。`,
        state.settings.pointNotifications,
      );
    }
    await gmSet(pointStorageKey(), points);
  }

  async function autoCheckIn() {
    if (!state.settings.autoCheckIn) return;
    const key = dataStorageKey(`check-in:${chinaDay()}`);
    if (await gmGet(key, false)) return;

    try {
      const { payload } = await requestJson(PLATFORM.signInPath, { method: 'POST' });
      const message = String(payload?.msg || '');
      const completed = isSuccess(payload) || /已经?签到|已签到|already.*sign/i.test(message);
      if (!completed) return;
      await gmSet(key, true);
      if (isSuccess(payload)) {
        notify(`${PLATFORM.name}每日签到成功`, '今日签到已完成。', state.settings.signInNotifications);
      }
    } catch (error) {
      console.debug('[HK enhancer] daily check-in skipped:', error);
    }
  }

  function hasSavedSessionMarker() {
    try {
      return Object.keys(localStorage).some((key) => /(?:hiascend|hikunpeng).*session/i.test(key)
        && Boolean(localStorage.getItem(key)));
    } catch (_) {
      return false;
    }
  }

  function findNativeLoginControl() {
    const controls = [...document.querySelectorAll('a, button, [role="button"]')];
    return controls.find((element) => {
      if (!isVisible(element)) return false;
      const text = normalizeText(element.textContent).toLowerCase();
      return text === '登录' || text === '登录/注册' || text === 'login';
    });
  }

  async function triggerNativeLogin(manual) {
    const attemptKey = dataStorageKey('native-login-attempt-at');
    const lastAttempt = Number(await gmGet(attemptKey, 0));
    const cooldownMs = 15 * 60 * 1000;
    if (!manual && Date.now() - lastAttempt < cooldownMs) return false;

    await gmSet(attemptKey, Date.now());
    for (let round = 0; round < 16; round += 1) {
      const loginControl = findNativeLoginControl();
      if (loginControl) {
        console.info('[HK enhancer] starting the official SSO login flow.');
        loginControl.click();
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  async function recoverLogin({ manual = false } = {}) {
    if (!state.settings.autoRelogin && !manual) return false;
    try {
      const { payload } = await requestJson(PLATFORM.accountPath);
      const restored = isSuccess(payload) && payload?.data && typeof payload.data === 'object';
      if (restored) {
        showToast('登录已恢复，正在刷新页面。');
        setTimeout(() => location.reload(), 500);
        return true;
      }
    } catch (error) {
      console.debug('[HK enhancer] silent login refresh failed:', error);
    }

    if (state.settings.nativeLoginFallback && (manual || hasSavedSessionMarker())) {
      const started = await triggerNativeLogin(manual);
      if (manual && !started) showToast('未找到站点原生登录入口；请手动打开登录菜单。');
      return started;
    }
    if (manual) showToast('没有可恢复的登录状态。');
    return false;
  }

  async function pollPoints({ manual = false, allowRecovery = true } = {}) {
    if (state.polling) return;
    state.polling = true;
    try {
      const { payload } = await requestJson(`${PLATFORM.apiBase}/exchange/center/getUserData`);
      const points = isSuccess(payload) ? getPoints(payload) : null;
      if (points !== null) {
        await rememberAndNotifyPoints(points);
        await autoCheckIn();
        if (manual) showToast(`当前积分：${points}`);
        return;
      }
      if (allowRecovery) await recoverLogin({ manual });
      else if (manual) showToast('暂时无法读取积分，请确认已登录。');
    } catch (error) {
      console.debug('[HK enhancer] points request failed:', error);
      if (manual) showToast('积分查询失败，请稍后重试。');
    } finally {
      state.polling = false;
    }
  }

  function startPointPolling() {
    clearInterval(state.pollTimer);
    pollPoints();
    state.pollTimer = setInterval(() => pollPoints(), state.settings.pointPollMinutes * 60 * 1000);
  }

  function startDomObserver() {
    const connect = () => {
      if (state.domObserver || !document.documentElement) return;
      state.domObserver = new MutationObserver(() => {
        if (state.lastPoints !== null) replaceHeaderPoints(state.lastPoints);
        filterSoldOutCards();
      });
      state.domObserver.observe(document.documentElement, {
        subtree: true, childList: true, characterData: true,
      });
      if (state.lastPoints !== null) replaceHeaderPoints(state.lastPoints);
      filterSoldOutCards();
    };
    if (document.documentElement) connect();
    else document.addEventListener('DOMContentLoaded', connect, { once: true });
  }

  function isSoldOutGift(gift) {
    return String(gift?.exchangeStatus) === '1' || Number(gift?.totalNum) <= 0;
  }

  function filterSoldOutCards() {
    if (!state.settings.filterSoldOutGifts) return;
    document.querySelectorAll('.o-card-main-wrap').forEach((card) => {
      const soldOut = [...card.querySelectorAll('button')]
        .some((button) => normalizeText(button.textContent) === '库存不足');
      if (soldOut) {
        card.hidden = true;
        card.dataset.hkEnhancerHidden = '1';
      } else if (card.dataset.hkEnhancerHidden === '1') {
        card.hidden = false;
        delete card.dataset.hkEnhancerHidden;
      }
    });
  }

  function installGiftFetchFilter() {
    if (!state.settings.filterSoldOutGifts) return;
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (pageWindow.__hkEnhancerGiftFilterInstalled || typeof pageWindow.fetch !== 'function') return;

    try {
      const nativeFetch = pageWindow.fetch.bind(pageWindow);
      const ResponseCtor = pageWindow.Response || Response;
      const HeadersCtor = pageWindow.Headers || Headers;
      let cachePromise = null;
      let cacheAt = 0;

      const getRequestUrl = (input) => new URL(
        typeof input === 'string' ? input : input.url,
        pageWindow.location.href,
      );
      const isGiftListRequest = (input) => {
        try {
          return getRequestUrl(input).pathname === PLATFORM.giftListPath;
        } catch (_) {
          return false;
        }
      };
      const loadAvailableGifts = async (requestUrl, init) => {
        if (cachePromise && Date.now() - cacheAt < 30_000) return cachePromise;
        const sourceUrl = new URL(requestUrl.href);
        sourceUrl.searchParams.set('pageNo', '1');
        sourceUrl.searchParams.set('pageSize', '100');
        cacheAt = Date.now();
        cachePromise = nativeFetch(sourceUrl.href, init)
          .then(async (response) => {
            if (!response.ok) throw new Error(`gift list request failed: ${response.status}`);
            const payload = await response.clone().json();
            if (!isSuccess(payload) || !Array.isArray(payload?.data?.list)) {
              throw new Error('unexpected gift-list payload');
            }
            return {
              response,
              data: payload.data,
              availableGifts: payload.data.list.filter((gift) => !isSoldOutGift(gift)),
            };
          })
          .catch((error) => {
            cachePromise = null;
            throw error;
          });
        return cachePromise;
      };

      pageWindow.fetch = async function hkEnhancerGiftFilter(input, init) {
        if (!isGiftListRequest(input)) return nativeFetch(input, init);
        try {
          const requestUrl = getRequestUrl(input);
          const requestedPageNo = Math.max(1, Number(requestUrl.searchParams.get('pageNo')) || 1);
          const requestedPageSize = Math.max(1, Number(requestUrl.searchParams.get('pageSize')) || 12);
          const { response, data, availableGifts } = await loadAvailableGifts(requestUrl, init);
          const pages = Math.max(1, Math.ceil(availableGifts.length / requestedPageSize));
          const pageNo = Math.min(requestedPageNo, pages);
          const start = (pageNo - 1) * requestedPageSize;
          const body = JSON.stringify({
            code: 200,
            msg: 'success',
            success: true,
            data: {
              ...data,
              pageNo,
              pageSize: requestedPageSize,
              pages,
              totalCount: availableGifts.length,
              list: availableGifts.slice(start, start + requestedPageSize),
              startSort: start + 1,
            },
          });
          const headers = new HeadersCtor(response.headers);
          headers.set('content-type', 'application/json;charset=UTF-8');
          return new ResponseCtor(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch (error) {
          console.warn('[HK enhancer] gift filter fallback:', error);
          return nativeFetch(input, init);
        }
      };
      pageWindow.__hkEnhancerGiftFilterInstalled = true;
    } catch (error) {
      console.warn('[HK enhancer] could not install page fetch filter:', error);
    }
  }

  function isContestSubmitPage() {
    return /^\/(?:zh\/)?developer\/contests\/details\/[^/]+\/submit(?:\/|$)/.test(
      location.pathname,
    );
  }

  function getCheckboxInput(control) {
    return control.matches?.('input[type="checkbox"]')
      ? control
      : control.querySelector?.('input[type="checkbox"]')
        || control.closest?.('label')?.querySelector('input[type="checkbox"]');
  }

  function hasCheckedMarker(control) {
    return [control, control.closest?.('label'), control.parentElement]
      .filter(Boolean)
      .some((element) => element.getAttribute?.('aria-checked') === 'true'
        || /(?:^|\s)(?:checked|is-checked|o-checkbox-checked)(?:\s|$)/.test(
          String(element.className || ''),
        ));
  }

  function isChecked(control) {
    const input = getCheckboxInput(control);
    if (hasCheckedMarker(control)) return true;

    // For the site's custom .o-checkbox, the native property can be changed
    // before Vue hydration and then reset. Require the component marker there;
    // accept the native state only for a plain-checkbox fallback.
    const isCustomCheckbox = control.matches?.('.o-checkbox')
      || control.closest?.('label')?.matches?.('.o-checkbox');
    return Boolean(input?.checked && !isCustomCheckbox);
  }

  function findContestAgreementControl() {
    // The current contest-submit form has a dedicated privacy box. Keeping this
    // selector scoped to that box prevents unrelated checkboxes from being touched.
    const scoped = document.querySelector(
      '.submit .footer-box .privacy-box .o-checkbox, '
      + '.footer-box .privacy-box .o-checkbox',
    );
    if (scoped) return scoped;

    // Fallback for minor markup changes: still require the checkbox to be inside
    // the submit footer and its label to mention agreement/consent text.
    return [...document.querySelectorAll(
      '.submit .footer-box label, .submit .footer-box input[type="checkbox"]',
    )].find((element) => {
      const label = element.closest('label') || element;
      return /协议|隐私|同意|承诺|agreement|privacy|consent/i.test(label.textContent || '');
    }) || null;
  }

  function clickContestAgreement() {
    if (!isContestSubmitPage()) return false;

    const control = findContestAgreementControl();
    if (!control) return false;
    if (isChecked(control)) return true;

    const input = getCheckboxInput(control);
    if (!input || input.disabled) return false;
    if (!input.checked) input.click();

    // If the control appeared before Vue attached its change handler, replay
    // the semantic events while the retry loop is active. This lets the
    // component update its model without ever touching the submit button.
    if (input.checked) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return isChecked(control);
  }

  function installContestAgreementAutoCheck() {
    let observer = null;
    let completed = false;
    let timer = null;
    let retryTimer = null;

    const disconnect = () => {
      observer?.disconnect();
      observer = null;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (retryTimer !== null) window.clearInterval(retryTimer);
      retryTimer = null;
    };

    const tryCheck = () => {
      if (!isContestSubmitPage()) {
        completed = false;
        disconnect();
        return;
      }
      if (completed) return;
      if (clickContestAgreement()) {
        completed = true;
        disconnect();
        console.info('[hiascend-hikunpeng-enhancer] contest submission agreement checked.');
      }
    };

    const observe = () => {
      if (!document.documentElement || observer) return;
      observer = new MutationObserver(tryCheck);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timer = window.setTimeout(disconnect, 30_000);
      retryTimer = window.setInterval(tryCheck, 100);
      tryCheck();
    };

    const schedule = () => {
      completed = false;
      disconnect();
      window.setTimeout(observe, 0);
    };

    // Contest pages are Vue/Nuxt SPA routes. Users commonly enter /submit via
    // history.pushState from the detail page, so a document-start-only check is
    // insufficient.
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        schedule();
        return result;
      };
    }
    window.addEventListener('popstate', schedule);

    if (document.documentElement) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });
  }

  function checked(value) {
    return value ? ' checked' : '';
  }

  function openSettings() {
    document.getElementById('hk-enhancer-settings')?.remove();
    const root = document.createElement('div');
    root.id = 'hk-enhancer-settings';
    root.innerHTML = `
      <section class="hk-panel" role="dialog" aria-modal="true" aria-labelledby="hk-enhancer-title">
        <header><h2 id="hk-enhancer-title">昇腾 / 鲲鹏增强设置</h2><button class="hk-close" type="button" aria-label="关闭">×</button></header>
        <form>
          <label class="hk-row"><input name="autoRelogin" type="checkbox"${checked(state.settings.autoRelogin)}><span><strong>自动恢复登录</strong><small>积分接口未登录时，先请求官方账号恢复端点。</small></span></label>
          <label class="hk-row"><input name="nativeLoginFallback" type="checkbox"${checked(state.settings.nativeLoginFallback)}><span><strong>使用站点原生 SSO 兜底</strong><small>仍未恢复且保留了会话标记时，点击页面原生“登录”入口。</small></span></label>
          <label class="hk-row"><input name="autoCheckIn" type="checkbox"${checked(state.settings.autoCheckIn)}><span><strong>每日自动签到</strong><small>确认已登录后，每个自然日只向官方签到接口提交一次。</small></span></label>
          <label class="hk-row"><input name="signInNotifications" type="checkbox"${checked(state.settings.signInNotifications)}><span><strong>签到成功时通知</strong><small>默认关闭，避免每日打扰。</small></span></label>
          <label class="hk-row"><input name="pointNotifications" type="checkbox"${checked(state.settings.pointNotifications)}><span><strong>积分增加时浏览器通知</strong><small>首次读取只建立基线，不会通知。</small></span></label>
          <label class="hk-select-row"><span><strong>积分轮询间隔</strong><small class="hk-note">仅在已打开社区页面的标签页内运行。</small></span><select name="pointPollMinutes">
            ${[1, 2, 5, 10, 15, 30].map((minutes) => `<option value="${minutes}"${Number(state.settings.pointPollMinutes) === minutes ? ' selected' : ''}>${minutes} 分钟</option>`).join('')}
          </select></label>
          <label class="hk-row"><input name="replacePointsLink" type="checkbox"${checked(state.settings.replacePointsLink)}><span><strong>右上角显示当前积分</strong><small>将“积分兑换”保留为原链接，但文字改成“积分：数值”。</small></span></label>
          <label class="hk-row"><input name="filterSoldOutGifts" type="checkbox"${checked(state.settings.filterSoldOutGifts)}><span><strong>隐藏库存不足礼品并自动补页</strong><small>整合自 hiascend-rewards-userscript 的列表过滤逻辑。</small></span></label>
          <label class="hk-row"><input name="contestAgreementAutoCheck" type="checkbox"${checked(state.settings.contestAgreementAutoCheck)}><span><strong>比赛提交页自动勾选协议</strong><small>仅作用于比赛提交页的协议控件；不会点击最终提交按钮。</small></span></label>
          <footer><button class="hk-secondary hk-cancel" type="button">取消</button><button class="hk-primary" type="submit">保存并刷新</button></footer>
        </form>
      </section>`;
    document.body.appendChild(root);
    root.querySelector('.hk-close').focus();

    const close = () => root.remove();
    root.addEventListener('click', async (event) => {
      if (event.target === root || event.target.closest('.hk-close, .hk-cancel')) {
        close();
        return;
      }
      if (!event.target.closest('form')) return;
      if (event.target.type !== 'submit') return;
      event.preventDefault();
      const form = root.querySelector('form');
      await saveSettings({
        autoRelogin: form.elements.autoRelogin.checked,
        nativeLoginFallback: form.elements.nativeLoginFallback.checked,
        autoCheckIn: form.elements.autoCheckIn.checked,
        signInNotifications: form.elements.signInNotifications.checked,
        pointNotifications: form.elements.pointNotifications.checked,
        pointPollMinutes: Number(form.elements.pointPollMinutes.value),
        replacePointsLink: form.elements.replacePointsLink.checked,
        filterSoldOutGifts: form.elements.filterSoldOutGifts.checked,
        contestAgreementAutoCheck: form.elements.contestAgreementAutoCheck.checked,
      });
      close();
      showToast('设置已保存，正在刷新页面以应用全部选项。');
      setTimeout(() => location.reload(), 650);
    });
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('⚙️ 昇腾 / 鲲鹏增强设置', openSettings);
    GM_registerMenuCommand('↻ 立即刷新积分', () => pollPoints({ manual: true }));
    GM_registerMenuCommand('↪ 立即尝试恢复登录', () => recoverLogin({ manual: true }));
  }

  (async () => {
    state.settings = await loadSettings();
    addStyles();
    installGiftFetchFilter();
    startDomObserver();
    installContestAgreementAutoCheck();
    registerMenuCommands();
    startPointPolling();
  })().catch((error) => console.error('[HK enhancer] startup failed:', error));
})();
