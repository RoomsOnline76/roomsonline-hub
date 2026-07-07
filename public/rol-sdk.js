/**
 * ROL'OS Booking SDK — Headless / White-label
 *
 * Companion to rol-embed.js for properties that want the booking flow to live
 * fully inside their own site. The SDK never navigates the parent page: it
 * either injects a chrome-less iframe into a container you provide, or exposes
 * the underlying booking API for you to render the UI yourself.
 *
 * Usage:
 *   <script src="https://widget.roomsonline.co.za/rol-sdk.js"></script>
 *   <script>
 *     RolosSDK.init({
 *       property: 'ocean-view-lodge',
 *       // optional: your CNAMEd subdomain that points at our hosting
 *       host: 'https://book.oceanview.com',
 *     });
 *
 *     document.querySelector('#book-btn').addEventListener('click', () => {
 *       RolosSDK.openCheckout({
 *         container: document.querySelector('#my-modal .body'),
 *         checkIn: '2026-07-20',
 *         checkOut: '2026-07-22',
 *       });
 *     });
 *
 *     RolosSDK.on('booking:complete', (payload) => { ... });
 *   </script>
 *
 * @version 1.0.0
 */
(function () {
  'use strict';

  var DEFAULT_HOST = 'https://book.sleepinafrica.roomsonline.co.za';
  var VERSION = '1.0.0';
  var config = { property: null, host: DEFAULT_HOST, brandColor: null, brandLogo: null };
  var listeners = {};
  var activeFrame = null;

  function emit(name, detail) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(detail); } catch (e) { /* consumer error */ }
    });
  }

  function ensureConfigured() {
    if (!config.property) {
      throw new Error('[RolosSDK] Call init({ property: "<slug>" }) before other methods.');
    }
  }

  function buildEmbedUrl(overrides) {
    ensureConfigured();
    var params = new URLSearchParams();
    params.set('mode', 'embedded');
    params.set('integration', 'rol_sdk');
    params.set('wl', '1');
    if (config.brandColor) params.set('brand_color', config.brandColor);
    if (config.brandLogo) params.set('brand_logo', config.brandLogo);
    if (config.hidePoweredBy !== false) params.set('hide_powered_by', '1');
    if (overrides) {
      Object.keys(overrides).forEach(function (k) {
        if (overrides[k] != null) params.set(k, String(overrides[k]));
      });
    }
    return config.host + '/embed/property/' + encodeURIComponent(config.property) + '?' + params.toString();
  }

  function handleMessage(e) {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (e.data.type.indexOf('rolos:') !== 0) return;
    if (activeFrame && e.data.type === 'rolos:resize') {
      activeFrame.style.height = e.data.height + 'px';
    }
    if (e.data.type === 'rolos:booking-complete') {
      emit('booking:complete', {
        bookingId: e.data.bookingId,
        confirmationNumber: e.data.confirmationNumber,
      });
    }
    if (e.data.type === 'rolos:step-change') {
      emit('step:change', { step: e.data.step });
    }
  }

  window.RolosSDK = {
    version: VERSION,

    init: function (opts) {
      if (!opts || !opts.property) throw new Error('[RolosSDK] "property" slug is required.');
      config.property = opts.property;
      if (opts.host) config.host = String(opts.host).replace(/\/$/, '');
      if (opts.brandColor) config.brandColor = opts.brandColor;
      if (opts.brandLogo) config.brandLogo = opts.brandLogo;
      if (opts.hidePoweredBy != null) config.hidePoweredBy = opts.hidePoweredBy;
    },

    /**
     * Mount a chrome-less booking iframe into `container`. The parent page
     * never navigates; guests complete the entire flow inside the container.
     */
    openCheckout: function (opts) {
      opts = opts || {};
      var container = opts.container || document.body;
      var extras = {};
      if (opts.checkIn) extras.checkIn = opts.checkIn;
      if (opts.checkOut) extras.checkOut = opts.checkOut;
      if (opts.roomId) extras.room = opts.roomId;
      if (opts.promoCode) extras.promo = opts.promoCode;

      var frame = document.createElement('iframe');
      frame.src = buildEmbedUrl(extras);
      frame.style.cssText = 'width:100%;border:none;min-height:' + (opts.height || 620) + 'px;';
      frame.setAttribute('allow', 'payment');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('title', 'Booking');
      container.innerHTML = '';
      container.appendChild(frame);
      activeFrame = frame;
      return frame;
    },

    closeCheckout: function () {
      if (activeFrame && activeFrame.parentNode) {
        activeFrame.parentNode.removeChild(activeFrame);
      }
      activeFrame = null;
    },

    /**
     * Low-level: fetch availability directly from the booking orchestrator.
     * Useful when you want to render your own room grid before invoking
     * openCheckout for the actual checkout step.
     */
    fetchAvailability: function (opts) {
      ensureConfigured();
      var body = {
        action: 'fetch_availability',
        property_slug: config.property,
        check_in: opts.checkIn,
        check_out: opts.checkOut,
      };
      return fetch(config.host + '/api/booking-orchestrator-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json(); });
    },

    on: function (name, handler) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(handler);
    },

    off: function (name, handler) {
      listeners[name] = (listeners[name] || []).filter(function (fn) { return fn !== handler; });
    },
  };

  window.addEventListener('message', handleMessage);
})();
