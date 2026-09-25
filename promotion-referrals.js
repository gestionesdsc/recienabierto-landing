/**
 * promotion-referrals.js
 * Helper independiente y comprobable para gestionar la redirección de enlaces de referidos
 * desde la página intermedia (redirect.html) hacia la app nativa de Recién Abierto.
 *
 * NOTA DE ARQUITECTURA:
 * El registro web de visitas de referidos está DESACTIVADO por diseño.
 * Una visita referral SOLO se contabiliza cuando el enlace llega y es procesado
 * dentro de la APP de Recién Abierto. La página web intermedia no envía peticiones
 * de registro a la Edge Function de referidos.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'ra_referral_visitor_id_v1';
  const TOKEN_REGEX = /^[0-9a-f]{64}$/i;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ENDPOINT_URL = 'https://ioghcoouqehcpplhspyd.supabase.co/functions/v1/promotion-referrals';

  /**
   * Genera un UUID v4 válido utilizando exclusivamente API criptográficas nativas.
   * Elimina cualquier respaldo inseguro (Math.random). Si falla o no está disponible, devuelve null.
   */
  function generateUuidV4(cryptoObj) {
    const c = cryptoObj || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c) {
      return null;
    }
    try {
      if (typeof c.randomUUID === 'function') {
        return c.randomUUID().toLowerCase();
      }
      if (typeof c.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        // Configurar bits de versión (4) y variante (8, 9, a, o b)
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        let hex = '';
        for (let i = 0; i < 16; i++) {
          hex += (bytes[i] + 0x100).toString(16).substr(1);
        }
        return [
          hex.substr(0, 8),
          hex.substr(8, 4),
          hex.substr(12, 4),
          hex.substr(16, 4),
          hex.substr(20, 12)
        ].join('-').toLowerCase();
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  /**
   * Valida estrictamente un UUID compatible con backend.
   */
  function isValidUuid(val) {
    if (!val || typeof val !== 'string') return false;
    return UUID_REGEX.test(val.trim());
  }

  /**
   * Valida un referral token hexadecimal de 64 caracteres.
   */
  function isValidToken(val) {
    if (!val || typeof val !== 'string') return false;
    return TOKEN_REGEX.test(val.trim());
  }

  /**
   * Recupera o genera un visitor_key anónimo y estable en localStorage.
   * Si localStorage falla o está bloqueado, devuelve un UUID efímero de manera segura.
   */
  function getVisitorKey(storageObj, generateIdFunc) {
    const storage = storageObj || (typeof localStorage !== 'undefined' ? localStorage : null);
    const gen = generateIdFunc || generateUuidV4;
    if (storage) {
      try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored && isValidUuid(stored)) {
          return stored.toLowerCase();
        }
        const newId = gen();
        if (!newId || !isValidUuid(newId)) return null;
        storage.setItem(STORAGE_KEY, newId.toLowerCase());
        return newId.toLowerCase();
      } catch (e) {
        // Bloqueo de privacidad, modo incógnito o QuotaExceededError -> continuar sin bloquear
      }
    }
    // Identidad efímera para esta carga
    const ephemeralId = gen();
    return (ephemeralId && isValidUuid(ephemeralId)) ? ephemeralId.toLowerCase() : null;
  }

  /**
   * Analiza una URL para comprobar si es exactamente la ruta /negocio/ID con ref válido.
   * Rechaza rutas con segmentos adicionales y funciona con o sin www.
   */
  function parseWebUrl(urlInput) {
    const res = {
      valid: false,
      businessId: null,
      referralToken: null,
      path: null,
      searchParams: null,
    };

    try {
      let u;
      if (typeof urlInput === 'string') {
        u = new URL(urlInput, 'https://www.recienabierto.com');
      } else if (urlInput && typeof urlInput.pathname === 'string') {
        u = new URL(urlInput.href || ('https://www.recienabierto.com' + urlInput.pathname + (urlInput.search || '')));
      } else {
        return res;
      }

      const pathname = u.pathname || '';
      // Reconocer únicamente /negocio/BUSINESS_ID o /negocio/BUSINESS_ID/
      const match = pathname.match(/^\/negocio\/([^\/?#]+)\/?$/i);
      if (!match || !match[1]) {
        return res;
      }

      const bizId = match[1];
      const params = new URLSearchParams(u.search);
      const rawRef = params.get('ref');

      if (!isValidToken(rawRef)) {
        return res;
      }

      res.valid = true;
      res.businessId = bizId;
      res.referralToken = rawRef.trim().toLowerCase();
      res.path = pathname.replace(/^\/+/, '');
      res.searchParams = params;
      return res;
    } catch (e) {
      return res;
    }
  }

  /**
   * Construye la URL del custom scheme recienabierto://negocio/ID preservando parámetros
   * de la URL original, normalizando ref a minúsculas y sustituyendo/adjuntando 'rid'.
   */
  function buildCustomSchemeUrl(path, searchParams, requestId) {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (params.has('ref')) {
      const val = params.get('ref');
      if (val) params.set('ref', val.trim().toLowerCase());
    }
    // Se elimina cualquier rid proveniente de la URL web (no confiar en rid de entrada)
    if (params.has('rid')) {
      params.delete('rid');
    }
    // Se adjunta el nuevo request_id de esta carga de página para preservar la trazabilidad
    if (requestId) {
      params.set('rid', requestId);
    }
    const queryString = params.toString();
    const cleanPath = path.replace(/^\/+/, '');
    return 'recienabierto://' + cleanPath + (queryString ? '?' + queryString : '');
  }

  /**
   * Registro web desactivado: la página web intermedia NO debe registrar visitas de referidos.
   * Devuelve siempre una promesa resuelta con false sin realizar peticiones de red.
   */
  function sendVisitRequest(referralToken, visitorKey, requestId, fetchFunc) {
    // Registro web desactivado: 0 llamadas de red al endpoint
    return Promise.resolve(false);
  }

  /**
   * Flujo principal de procesamiento y redirección a la app nativa.
   * Construye el esquema recienabierto://negocio/ID?ref=...&rid=... y resuelve
   * de forma inmediata para abrir la app sin registrar la visita desde la web.
   */
  function processAndRedirect(urlInput, options) {
    const opts = options || {};
    const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const generateId = opts.generateUuid || function () { return generateUuidV4(opts.crypto); };

    function getFallbackScheme() {
      let path = 'negocio/default';
      if (typeof urlInput === 'string') {
        try {
          const u = new URL(urlInput, 'https://www.recienabierto.com');
          path = (u.pathname || '').replace(/^\/+/, '') + (u.search || '');
        } catch (e) {}
      } else if (urlInput && typeof urlInput.pathname === 'string') {
        path = (urlInput.pathname || '').replace(/^\/+/, '') + (urlInput.search || '');
      }
      return 'recienabierto://' + path;
    }

    const parsed = parseWebUrl(urlInput);

    // Si no tiene ref, es inválido, o la ruta no encaja, comportamiento original (sin rid, sin llamada)
    if (!parsed.valid) {
      return Promise.resolve({
        called: false,
        schemeUrl: getFallbackScheme(),
        requestId: null,
      });
    }

    // 1. Identidad web para trazabilidad
    const visitorKey = getVisitorKey(storage, generateId);

    // 2. Generar un request_id único para esta carga de página
    const rawRequestId = generateId();
    const requestId = rawRequestId && isValidUuid(rawRequestId) ? rawRequestId.toLowerCase() : null;

    // Si la generación falla, abrir normalmente la app con el esquema fallback
    if (!requestId) {
      return Promise.resolve({
        called: false,
        schemeUrl: getFallbackScheme(),
        requestId: null,
      });
    }

    // 3. Construir URL nativa con el mismo request_id como rid y token en minúsculas
    const schemeUrl = buildCustomSchemeUrl(parsed.path, parsed.searchParams, requestId);

    // 4. Registro web desactivado: resolver inmediatamente sin peticiones de red
    // La visita se registrará única y exclusivamente dentro de la APP al abrir la ficha
    return Promise.resolve({
      called: false,
      schemeUrl: schemeUrl,
      requestId: requestId,
      raceResult: 'web_registration_disabled',
    });
  }

  const exported = {
    STORAGE_KEY: STORAGE_KEY,
    ENDPOINT_URL: ENDPOINT_URL,
    generateUuidV4: generateUuidV4,
    isValidUuid: isValidUuid,
    isValidToken: isValidToken,
    getVisitorKey: getVisitorKey,
    parseWebUrl: parseWebUrl,
    buildCustomSchemeUrl: buildCustomSchemeUrl,
    sendVisitRequest: sendVisitRequest,
    processAndRedirect: processAndRedirect,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    global.PromotionReferrals = exported;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
