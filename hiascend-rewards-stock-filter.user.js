// ==UserScript==
// @name         昇腾 / 鲲鹏积分兑换中心 - 隐藏库存不足礼品
// @namespace    https://github.com/KaranocaVe/hiascend-rewards-userscript
// @version      1.1.0
// @description  同时支持昇腾社区和鲲鹏社区，隐藏库存不足礼品并让后续页自动补位。
// @author       KaranocaVe
// @match        https://www.hiascend.com/developer/rewards*
// @match        https://www.hiascend.com/zh/developer/rewards*
// @match        https://www.hikunpeng.com/developer/rewards*
// @match        https://www.hikunpeng.com/zh/developer/rewards*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  if (window.__hiascendRewardsStockFilterInstalled) return;
  window.__hiascendRewardsStockFilterInstalled = true;

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

  window.fetch = async function filteredFetch(input, init) {
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

  if (document.documentElement) {
    startCardObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startCardObserver, { once: true });
  }
})();
