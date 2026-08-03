/**
 * promotion-referrals.js
 * Helper independiente y comprobable para gestionar el registro de visitas de referidos
 * desde la landing web en redirect.html sin dependencias de terceros ni frameworks.
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
   * Utiliza el generador inyectado en pruebas o la fuente criptográfica segura real.
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
    // Se adjunta el nuevo request_id de esta carga de página
    if (requestId) {
      params.set('rid', requestId);
    }
    const queryString = params.toString();
    const cleanPath = path.replace(/^\/+/, '');
    return 'recienabierto://' + cleanPath + (queryString ? '?' + queryString : '');
  }

  /**
   * Envía la visita al endpoint de Supabase mediante fetch con keepalive.
   * Nunca lanza error ni muestra alertas.
   */
  function sendVisitRequest(referralToken, visitorKey, requestId, fetchFunc) {
    const fetcher = fetchFunc || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetcher) {
      return Promise.resolve(false);
    }

    const payload = {
      action: 'record_visit',
      referral_token: referralToken,
      visitor_type: 'web',
      visitor_key: visitorKey,
      request_id: requestId,
    };

    try {
      return fetcher(ENDPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
      .then(function (response) {
        return response.json().catch(function () { return {}; });
      })
      .then(function () {
        return true;
      })
      .catch(function () {
        // Error de red manejado de forma segura sin exponer token ni visitor_key
        return false;
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /**
   * Flujo principal de procesamiento y navegación con carrera de máximo 250 ms.
   */
  function processAndRedirect(urlInput, options) {
    const opts = options || {};
    const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const fetchFunc = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    const generateId = opts.generateUuid || function () { return generateUuidV4(opts.crypto); };
    const maxWaitMs = typeof opts.maxWaitMs === 'number' ? opts.maxWaitMs : 250;

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

    // 1. Identidad web anónima de fuente segura o inyectada
    const visitorKey = getVisitorKey(storage, generateId);

    // 2. Generar un request_id único y seguro para esta carga
    const rawRequestId = generateId();
    const requestId = rawRequestId && isValidUuid(rawRequestId) ? rawRequestId.toLowerCase() : null;

    // Si no existe ninguna fuente criptográfica segura o la generación falla:
    // no llamar al endpoint desde la web; no añadir rid; abrir normalmente la app.
    if (!visitorKey || !requestId) {
      return Promise.resolve({
        called: false,
        schemeUrl: getFallbackScheme(),
        requestId: null,
      });
    }

    // 3. Construir URL nativa con el mismo request_id como rid y token en minúsculas
    const schemeUrl = buildCustomSchemeUrl(parsed.path, parsed.searchParams, requestId);

    // 4. Iniciar la petición HTTP en segundo plano sin esperar indefinidamente
    const fetchPromise = sendVisitRequest(parsed.referralToken, visitorKey, requestId, fetchFunc);

    // 5. Carrera de 250 ms máx contra el fetch
    const timeoutPromise = new Promise(function (resolve) {
      setTimeout(function () { resolve('timeout'); }, maxWaitMs);
    });

    return Promise.race([fetchPromise, timeoutPromise]).then(function (result) {
      return {
        called: true,
        schemeUrl: schemeUrl,
        requestId: requestId,
        raceResult: result,
      };
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
