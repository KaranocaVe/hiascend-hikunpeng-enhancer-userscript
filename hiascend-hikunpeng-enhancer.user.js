// ==UserScript==
// @name         昇腾 / 鲲鹏社区集成增强
// @namespace    https://github.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript
// @version      2.0.0
// @description  昇腾与鲲鹏社区增强插件：库存过滤、分页补齐与比赛提交协议自动勾选。
// @author       KaranocaVe
// @downloadURL  https://raw.githubusercontent.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript/main/hiascend-hikunpeng-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript/main/hiascend-hikunpeng-enhancer.user.js
// @match        https://www.hiascend.com/developer/rewards*
// @match        https://www.hiascend.com/zh/developer/rewards*
// @match        https://www.hikunpeng.com/developer/rewards*
// @match        https://www.hikunpeng.com/zh/developer/rewards*
// @match        https://www.hiascend.com/developer/contests/*
// @match        https://www.hiascend.com/zh/developer/contests/*
// @match        https://www.hikunpeng.com/developer/contests/*
// @match        https://www.hikunpeng.com/zh/developer/contests/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  if (window.__hiascendKunpengEnhancerInstalled) return;
  window.__hiascendKunpengEnhancerInstalled = true;

  const LIST_PATHS = new Set([
    '/ascendgateway/ascendservice/exchange/center/gift/list',
    '/kunpenggateway/kunpengservice/exchange/center/gift/list',
  ]);
  const CACHE_TTL_MS = 30_000;
  const nativeFetch = window.fetch.bind(window);
  let cachePromise = null;
  let cacheAt = 0;

  const getRequestUrl = (input) => new URL(
    typeof input === 'string' ? input : input.url,
    location.href,
  );

  const isGiftListRequest = (input) => {
    try {
      return LIST_PATHS.has(getRequestUrl(input).pathname);
    } catch (_) {
      return false;
    }
  };

  const isRewardsPage = () => /^\/(?:zh\/)?developer\/rewards(?:\/|$)/.test(
    location.pathname,
  );

  const isSoldOutGift = (gift) => (
    String(gift?.exchangeStatus) === '1' || Number(gift?.totalNum) <= 0
  );

  async function loadAvailableGifts(requestUrl, init) {
    if (cachePromise && Date.now() - cacheAt < CACHE_TTL_MS) {
      return cachePromise;
    }

    const sourceUrl = new URL(requestUrl.href);
    sourceUrl.searchParams.set('pageNo', '1');
    sourceUrl.searchParams.set('pageSize', '100');
    cacheAt = Date.now();

    cachePromise = nativeFetch(sourceUrl.href, init)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`gift list request failed: ${response.status}`);
        }
        const payload = await response.json();
        if (payload?.code !== 200 || !Array.isArray(payload?.data?.list)) {
          throw new Error('unexpected gift list payload');
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
  }

  const filteredFetch = async function filteredFetch(input, init) {
    if (!isGiftListRequest(input)) {
      return nativeFetch(input, init);
    }

    try {
      const requestUrl = getRequestUrl(input);
      const requestedPageNo = Math.max(
        1,
        Number(requestUrl.searchParams.get('pageNo')) || 1,
      );
      const requestedPageSize = Math.max(
        1,
        Number(requestUrl.searchParams.get('pageSize')) || 12,
      );
      const { response, data, availableGifts } = await loadAvailableGifts(
        requestUrl,
        init,
      );
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
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json;charset=UTF-8');
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('[rewards-stock-filter] fallback:', error);
      return nativeFetch(input, init);
    }
  };

  function hideSoldOutCards() {
    document.querySelectorAll('.o-card-main-wrap').forEach((card) => {
      const soldOut = [...card.querySelectorAll('button')]
        .some((button) => button.textContent.trim() === '库存不足');
      if (soldOut) {
        card.hidden = true;
        card.dataset.hiascendRewardsHidden = '1';
      } else if (card.dataset.hiascendRewardsHidden === '1') {
        card.hidden = false;
        delete card.dataset.hiascendRewardsHidden;
      }
    });
  }

  function startCardObserver() {
    hideSoldOutCards();
    new MutationObserver(hideSoldOutCards).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
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

  if (isRewardsPage()) {
    window.fetch = filteredFetch;
    if (document.documentElement) {
      startCardObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startCardObserver, { once: true });
    }
  }

  installContestAgreementAutoCheck();
})();
