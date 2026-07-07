/**
 * ROL'OS Embeddable Booking Widget — Universal Loader
 * 
 * Usage (one-liner):
 *   <script src="https://widget.roomsonline.co.za/rol-embed.js"></script>
 *   <div data-rolos-property="ocean-view-lodge"></div>
 *
 * Advanced:
 *   <div data-rolos-property="ocean-view-lodge"
 *        data-brand-color="#2563eb"
 *        data-brand-logo="https://example.com/logo.png"
 *        data-brand-secondary-color="#1e40af"
 *        data-brand-font-color="#ffffff"
 *        data-layout="standard"
 *        data-height="600"
 *        data-hide-powered-by="false"
 *        data-lang="en">
 *   </div>
 *
 * Programmatic API:
 *   window.RolosBooking.init()           — re-scan the page for new containers
 *   window.RolosBooking.setDates(slug, checkIn, checkOut)
 *   window.RolosBooking.setPromo(slug, code)
 *
 * Events emitted on the container element:
 *   rolos:loaded        — widget iframe loaded
 *   rolos:step-change   — { detail: { step, slug } }
 *   rolos:booking-complete — { detail: { bookingId, confirmationNumber, slug } }
 *   rolos:resize        — { detail: { height, slug } }
 *
 * @version 1.0.0
 * @license MIT
 * @see https://connect.roomsonline.co.za/docs
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://book.sleepinafrica.roomsonline.co.za';
  var VERSION = '1.0.0';
  var ATTR = 'data-rolos-property';
  var PORTFOLIO_ATTR = 'data-rolos-portfolio';
  var INIT_ATTR = 'data-rolos-initialized';

  // Track all active widgets by slug
  var widgets = {};
  var portfolioWidgets = {};

  function getAttr(el, name, fallback) {
    var val = el.getAttribute(name);
    return val != null && val !== '' ? val : (fallback || '');
  }

  function emitEvent(el, name, detail) {
    var evt;
    if (typeof CustomEvent === 'function') {
      evt = new CustomEvent(name, { detail: detail, bubbles: true });
    } else {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(name, true, false, detail);
    }
    el.dispatchEvent(evt);
  }

  function resolveBase(config) {
    if (config && config.wlHost) return String(config.wlHost).replace(/\/$/, '');
    return DEFAULT_BASE;
  }

  function buildEmbedUrl(slug, config) {
    var params = new URLSearchParams();
    params.set('integration', 'rol_embed');
    params.set('mode', 'embedded');
    if (config.brandColor) params.set('brand_color', config.brandColor);
    if (config.brandLogo) params.set('brand_logo', config.brandLogo);
    if (config.brandSecondaryColor) params.set('brand_secondary_color', config.brandSecondaryColor);
    if (config.brandFontColor) params.set('brand_font_color', config.brandFontColor);
    if (config.layout) params.set('layout', config.layout);
    if (config.hidePoweredBy || config.whiteLabel) params.set('hide_powered_by', '1');
    if (config.whiteLabel) params.set('wl', '1');
    if (config.lang) params.set('lang', config.lang);
    params.set('embed_version', VERSION);
    return resolveBase(config) + '/embed/property/' + encodeURIComponent(slug) + '?' + params.toString();
  }

  function createWidget(container) {
    if (container.getAttribute(INIT_ATTR)) return;

    var slug = getAttr(container, ATTR);
    if (!slug) return;

    var config = {
      brandColor: getAttr(container, 'data-brand-color'),
      brandLogo: getAttr(container, 'data-brand-logo'),
      brandSecondaryColor: getAttr(container, 'data-brand-secondary-color'),
      brandFontColor: getAttr(container, 'data-brand-font-color'),
      layout: getAttr(container, 'data-layout', 'standard'),
      height: getAttr(container, 'data-height', '600'),
      hidePoweredBy: getAttr(container, 'data-hide-powered-by') === 'true',
      whiteLabel: getAttr(container, 'data-white-label') === 'true' || getAttr(container, 'data-wl') === '1',
      wlHost: getAttr(container, 'data-wl-host'),
      lang: getAttr(container, 'data-lang'),
    };

    var iframe = document.createElement('iframe');
    iframe.src = buildEmbedUrl(slug, config);
    iframe.style.cssText = 'width:100%;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);transition:height 0.2s ease;';
    iframe.style.height = config.height + 'px';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    iframe.setAttribute('title', 'Book with ROL\'OS');
    iframe.setAttribute('data-rolos-slug', slug);

    // Loading state
    var loader = document.createElement('div');
    loader.style.cssText = 'display:flex;align-items:center;justify-content:center;height:' + config.height + 'px;background:#fafafa;border-radius:8px;font-family:system-ui,sans-serif;color:#999;font-size:14px;';
    loader.textContent = 'Loading booking widget...';
    container.appendChild(loader);

    iframe.onload = function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      emitEvent(container, 'rolos:loaded', { slug: slug });
    };

    container.appendChild(iframe);
    container.setAttribute(INIT_ATTR, 'true');

    widgets[slug] = { container: container, iframe: iframe, config: config };
  }

  // Listen for postMessage from iframe
  function handleMessage(e) {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (e.data.type.indexOf('rolos:') !== 0) return;

    var slug = e.data.slug;
    var widget = slug ? widgets[slug] : null;

    switch (e.data.type) {
      case 'rolos:resize':
        // Find matching iframe and resize
        if (widget && widget.iframe) {
          widget.iframe.style.height = e.data.height + 'px';
          emitEvent(widget.container, 'rolos:resize', { height: e.data.height, slug: slug });
        } else {
          // Fallback: find by source
          var iframes = document.querySelectorAll('iframe[data-rolos-slug]');
          for (var i = 0; i < iframes.length; i++) {
            if (iframes[i].contentWindow === e.source) {
              iframes[i].style.height = e.data.height + 'px';
              var parentEl = iframes[i].closest('[' + ATTR + ']');
              if (parentEl) emitEvent(parentEl, 'rolos:resize', { height: e.data.height, slug: e.data.slug });
              break;
            }
          }
        }
        break;

      case 'rolos:booking-complete':
        if (widget) {
          emitEvent(widget.container, 'rolos:booking-complete', {
            bookingId: e.data.bookingId,
            confirmationNumber: e.data.confirmationNumber,
            slug: slug,
          });
        }
        break;

      case 'rolos:step-change':
        if (widget) {
          emitEvent(widget.container, 'rolos:step-change', {
            step: e.data.step,
            slug: slug,
          });
        }
        break;
    }
  }

  function sendToIframe(slug, message) {
    var widget = widgets[slug];
    if (widget && widget.iframe && widget.iframe.contentWindow) {
      widget.iframe.contentWindow.postMessage(message, resolveBase(widget.config));
    }
  }

  function createPortfolioWidget(container) {
    if (container.getAttribute(INIT_ATTR)) return;
    var slug = getAttr(container, PORTFOLIO_ATTR);
    if (!slug) return;

    var config = {
      brandColor: getAttr(container, 'data-brand-color'),
      brandLogo: getAttr(container, 'data-brand-logo'),
      layout: getAttr(container, 'data-layout', 'grid'),
      height: getAttr(container, 'data-height', '700'),
      whiteLabel: getAttr(container, 'data-white-label') === 'true' || getAttr(container, 'data-wl') === '1',
      wlHost: getAttr(container, 'data-wl-host'),
    };

    var params = new URLSearchParams();
    if (config.brandColor) params.set('brand_color', config.brandColor);
    if (config.brandLogo) params.set('brand_logo', config.brandLogo);
    if (config.layout) params.set('layout', config.layout);
    if (config.whiteLabel) { params.set('wl', '1'); params.set('hide_powered_by', '1'); }
    params.set('embed_version', VERSION);
    var src = resolveBase(config) + '/embed/portfolio/' + encodeURIComponent(slug) + '?' + params.toString();

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.cssText = 'width:100%;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);transition:height 0.2s ease;';
    iframe.style.height = config.height + 'px';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    iframe.setAttribute('title', 'Browse & Book Properties');
    iframe.setAttribute('data-rolos-portfolio-slug', slug);

    var loader = document.createElement('div');
    loader.style.cssText = 'display:flex;align-items:center;justify-content:center;height:' + config.height + 'px;background:#fafafa;border-radius:8px;font-family:system-ui,sans-serif;color:#999;font-size:14px;';
    loader.textContent = 'Loading portfolio...';
    container.appendChild(loader);

    iframe.onload = function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      emitEvent(container, 'rolos:loaded', { portfolio: slug });
    };

    container.appendChild(iframe);
    container.setAttribute(INIT_ATTR, 'true');
    portfolioWidgets[slug] = { container: container, iframe: iframe, config: config };
  }

  function init() {
    var containers = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < containers.length; i++) {
      createWidget(containers[i]);
    }
    var portfolioContainers = document.querySelectorAll('[' + PORTFOLIO_ATTR + ']');
    for (var j = 0; j < portfolioContainers.length; j++) {
      createPortfolioWidget(portfolioContainers[j]);
    }
  }

  // Public API
  window.RolosBooking = {
    version: VERSION,
    init: init,
    setDates: function (slug, checkIn, checkOut) {
      sendToIframe(slug, { type: 'rolos:setDates', checkIn: checkIn, checkOut: checkOut });
    },
    setPromo: function (slug, code) {
      sendToIframe(slug, { type: 'rolos:setPromo', code: code });
    },
    getWidgets: function () {
      return Object.keys(widgets);
    },
    getPortfolios: function () {
      return Object.keys(portfolioWidgets);
    },
    initPortfolio: function () {
      var containers = document.querySelectorAll('[' + PORTFOLIO_ATTR + ']');
      for (var i = 0; i < containers.length; i++) {
        createPortfolioWidget(containers[i]);
      }
    },
  };

  // Auto-init
  window.addEventListener('message', handleMessage);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // MutationObserver for dynamically added containers (SPA support)
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      var shouldInit = false;
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1 && (added[j].hasAttribute(ATTR) || added[j].querySelector('[' + ATTR + ']') || added[j].hasAttribute(PORTFOLIO_ATTR) || added[j].querySelector('[' + PORTFOLIO_ATTR + ']'))) {
            shouldInit = true;
            break;
          }
        }
        if (shouldInit) break;
      }
      if (shouldInit) init();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
})();
