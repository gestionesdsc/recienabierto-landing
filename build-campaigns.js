/**
 * build-campaigns.js
 * Script de build para Netlify que consulta Supabase y pre-renderiza
 * las páginas estáticas de campañas con metadatos Open Graph.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const tls = require('tls');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ioghcoouqehcpplhspyd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZ2hjb291cWVoY3BwbGhzcHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQ1NDksImV4cCI6MjA3NTQzMDU0OX0.4ynUrBlb1eMZA5gptIxjunfveIwTdVDpSRjeF2mc-g0';

function getTrustedCAs() {
  const cas = [];
  // En entornos locales de desarrollo con escaneos antivirus (Avast/proxy), incluir la CA local para validación criptográfica estricta
  const potentialPaths = [
    path.join(__dirname, 'local-ca.pem'),
    'C:\\Users\\ACER\\avast-root.pem'
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      try {
        cas.push(fs.readFileSync(p));
      } catch (_) {}
    }
  }
  if (cas.length > 0 && Array.isArray(tls.rootCertificates)) {
    return [...tls.rootCertificates, ...cas];
  }
  return undefined;
}

function fetchActiveCampaigns() {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/special_campaigns?select=id,slug,name,banner_text,hero_image_url,is_active&is_active=eq.true`;
    const ca = getTrustedCAs();
    const reqOptions = {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    };
    if (ca) {
      reqOptions.ca = ca;
    }
    const req = https.get(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Supabase JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`Supabase REST error HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
  });
}

const CAMPAIGN_COVER_FALLBACKS = {
  'sabores-castellon-2026': 'https://www.recienabierto.com/assets/institucional-ruta-tapas-mapa.jpg'
};

const CORPORATE_OG_IMAGE = 'https://www.recienabierto.com/og-recien-abierto.jpg';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCampaignHtml({
  slug,
  title,
  description,
  imageUrl,
  canonicalUrl,
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safeUrl = escapeHtml(canonicalUrl);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} · Recién Abierto</title>
  <meta name="description" content="${safeDesc}">

  <!-- Open Graph / WhatsApp / Facebook / Telegram -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Recién Abierto">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${safeUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">

  <link rel="canonical" href="${safeUrl}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      text-align: center;
      padding: 30px 20px;
      color: #334155;
      background-color: #F8FAFC;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .card {
      background: #FFFFFF;
      border-radius: 24px;
      padding: 28px 24px;
      max-width: 420px;
      width: 100%;
      margin: auto;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      border: 1px solid #E2E8F0;
      overflow-wrap: break-word;
      word-wrap: break-word;
      text-align: center;
    }
    .hero-img {
      width: 100%;
      height: 190px;
      border-radius: 16px;
      object-fit: cover;
      margin-bottom: 20px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
      background-color: #F1F5F9;
    }
    .spinner {
      margin: 20px auto;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #18B7C6;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .campaign-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #FFF7ED;
      color: #EA580C;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-radius: 999px;
      border: 1px solid #FED7AA;
      margin-bottom: 12px;
    }
    .app-title {
      font-size: 21px;
      line-height: 1.3;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 8px;
    }
    .app-desc {
      font-size: 14px;
      line-height: 1.45;
      color: #64748B;
      margin-bottom: 24px;
    }
    .btn-download {
      display: block;
      width: 100%;
      padding: 15px 20px;
      background-color: #18B7C6;
      color: #FFFFFF !important;
      font-size: 14px;
      line-height: 1.35;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-decoration: none;
      border-radius: 14px;
      box-shadow: 0 4px 14px rgba(24, 183, 198, 0.35);
      cursor: pointer;
      border: none;
      transition: background-color 0.15s ease;
    }
    .btn-download:active {
      background-color: #139ca9;
      transform: translateY(1px);
    }
    .btn-open-app {
      display: block;
      width: 100%;
      padding: 12px 20px;
      margin-top: 10px;
      background-color: #F1F5F9;
      color: #0F172A !important;
      font-size: 13px;
      line-height: 1.35;
      font-weight: 700;
      text-decoration: none;
      border-radius: 14px;
      border: 1px solid #CBD5E1;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .btn-open-app:active {
      background-color: #E2E8F0;
      transform: translateY(1px);
    }
    .status-text {
      font-size: 16px;
      font-weight: 500;
      color: #475569;
    }
    .app-note {
      font-size: 12px;
      line-height: 1.45;
      color: #64748B;
      margin-top: 14px;
      margin-bottom: 0;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <!-- Estado de carga inicial (intenta abrir la app si está instalada) -->
  <div id="loading-state">
    <div class="spinner"></div>
    <p class="status-text">Abriendo ${safeTitle} en la app...</p>
  </div>

  <!-- Tarjeta Android -->
  <div id="android-card" class="card" style="display: none;">
    <img src="${safeImage}" alt="${safeTitle}" class="hero-img" onerror="this.src='/logo-recien-abierto.png';">
    <span class="campaign-badge">Campaña especial</span>
    <h1 class="app-title">${safeTitle}</h1>
    <p class="app-desc">${safeDesc}</p>
    <a id="btn-download-android" href="intent://details?id=com.recienabierto.recienabierto#Intent;scheme=market;package=com.android.vending;end" class="btn-download">DESCARGAR EN GOOGLE PLAY</a>
    <a href="recienabierto://campana/${slug}" class="btn-open-app">¿Ya tienes la app? Abrir aquí</a>
    <p class="app-note">Instala la app para explorar todos los establecimientos y mapa exclusivo.</p>
  </div>

  <!-- Tarjeta iOS -->
  <div id="ios-card" class="card" style="display: none;">
    <img src="${safeImage}" alt="${safeTitle}" class="hero-img" onerror="this.src='/logo-recien-abierto.png';">
    <span class="campaign-badge">Campaña especial</span>
    <h1 class="app-title">${safeTitle}</h1>
    <p class="app-desc">${safeDesc}</p>
    <a id="btn-download-ios" href="itms-apps://apps.apple.com/app/id6766087032" class="btn-download">DESCARGAR EN APP STORE</a>
    <a href="recienabierto://campana/${slug}" class="btn-open-app">¿Ya tienes la app? Abrir aquí</a>
    <p class="app-note">Instala la app para explorar todos los establecimientos y mapa exclusivo.</p>
  </div>

  <!-- Tarjeta Desktop -->
  <div id="desktop-state" class="card" style="display: none;">
    <img src="${safeImage}" alt="${safeTitle}" class="hero-img" onerror="this.src='/logo-recien-abierto.png';">
    <span class="campaign-badge">Campaña especial</span>
    <h1 class="app-title">${safeTitle}</h1>
    <p class="app-desc">${safeDesc}<br><br>Para explorar esta campaña y sus participantes en el mapa interactivo, abre este enlace desde tu teléfono móvil.</p>
  </div>

  <script src="/promotion-referrals.js"></script>
  <script>
    (function() {
      var userAgent = navigator.userAgent || navigator.vendor || window.opera;
      var isIOS = /iPad|iPhone|iPod/i.test(userAgent) && !window.MSStream;
      var isAndroid = /Android/i.test(userAgent);

      var pathWithQuery = window.location.pathname + window.location.search;
      var cleanPath = pathWithQuery.replace(/^\\//, '');
      var fallbackScheme = 'recienabierto://' + cleanPath;

      var appNavigationAttempted = false;
      var hasLeftPage = false;

      function cancelFallback() {
        hasLeftPage = true;
      }

      window.addEventListener('pagehide', cancelFallback);
      window.addEventListener('blur', cancelFallback);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) cancelFallback();
      });

      function navigateToAppOnce(url) {
        if (appNavigationAttempted) return;
        appNavigationAttempted = true;
        window.location.replace(url || fallbackScheme);
      }

      if (isIOS || isAndroid) {
        try {
          if (window.PromotionReferrals && window.PromotionReferrals.processAndRedirect) {
            Promise.resolve(
              window.PromotionReferrals.processAndRedirect(window.location)
            ).then(
              function (res) {
                navigateToAppOnce((res && res.schemeUrl) || fallbackScheme);
              },
              function () {
                navigateToAppOnce(fallbackScheme);
              }
            );
          } else {
            navigateToAppOnce(fallbackScheme);
          }
        } catch (e) {
          navigateToAppOnce(fallbackScheme);
        }
      }

      if (isAndroid) {
        setTimeout(function () {
          if (!hasLeftPage && !document.hidden) {
            document.getElementById('loading-state').style.display = 'none';
            document.getElementById('android-card').style.display = 'block';
          }
        }, 1100);

        var downloadBtnAndroid = document.getElementById('btn-download-android');
        if (downloadBtnAndroid) {
          downloadBtnAndroid.addEventListener('click', function () {
            setTimeout(function () {
              if (!document.hidden) {
                window.location.href = 'https://play.google.com/store/apps/details?id=com.recienabierto.recienabierto';
              }
            }, 1500);
          });
        }
      } else if (isIOS) {
        setTimeout(function () {
          if (!hasLeftPage && !document.hidden) {
            document.getElementById('loading-state').style.display = 'none';
            document.getElementById('ios-card').style.display = 'block';
          }
        }, 1100);

        var downloadBtnIos = document.getElementById('btn-download-ios');
        if (downloadBtnIos) {
          downloadBtnIos.addEventListener('click', function () {
            setTimeout(function () {
              if (!document.hidden) {
                window.location.href = 'https://apps.apple.com/es/app/recien-abierto/id6766087032';
              }
            }, 1500);
          });
        }
      } else {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('desktop-state').style.display = 'block';
      }
    })();
  </script>
</body>
</html>`;
}

async function main() {
  console.log('🚀 Build: Conectando a Supabase para sincronizar páginas de campaña...');
  let campaigns = [];
  try {
    campaigns = await fetchActiveCampaigns();
  } catch (err) {
    console.error('❌ ERROR consultando Supabase en build:', err.message);
    process.exit(1);
  }

  const baseDir = path.resolve(__dirname);
  const campanaDir = path.join(baseDir, 'campana');
  if (!fs.existsSync(campanaDir)) {
    fs.mkdirSync(campanaDir, { recursive: true });
  }

  const activeSlugs = new Set(campaigns.map(c => c.slug));

  // Limpiar directorios de campañas que ya no están activas en Supabase
  const existingEntries = fs.readdirSync(campanaDir, { withFileTypes: true });
  for (const entry of existingEntries) {
    if (entry.isDirectory() && !activeSlugs.has(entry.name)) {
      const obsoleteDir = path.join(campanaDir, entry.name);
      fs.rmSync(obsoleteDir, { recursive: true, force: true });
      console.log(`🗑️ Campaña inactiva o eliminada retirada: [${entry.name}]`);
    }
  }

  // Fallback /campana/index.html
  const fallbackHtml = renderCampaignHtml({
    slug: 'default',
    title: 'Planes y Campañas Gastronómicas',
    description: 'Descubre los nuevos planes, rutas gastronómicas y aperturas en Recién Abierto.',
    imageUrl: CORPORATE_OG_IMAGE,
    canonicalUrl: 'https://recienabierto.com/campana/',
  });
  fs.writeFileSync(path.join(campanaDir, 'index.html'), fallbackHtml, 'utf8');

  // Cada campaña activa
  for (const camp of campaigns) {
    const dir = path.join(campanaDir, camp.slug);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const imageUrl =
      camp.hero_image_url ||
      CAMPAIGN_COVER_FALLBACKS[camp.slug] ||
      CORPORATE_OG_IMAGE;

    const description =
      camp.banner_text ||
      'Descubre los establecimientos participantes y novedades en Recién Abierto.';

    const html = renderCampaignHtml({
      slug: camp.slug,
      title: camp.name,
      description,
      imageUrl,
      canonicalUrl: `https://recienabierto.com/campana/${camp.slug}`,
    });

    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    console.log(`✅ [${camp.slug}] sincronizado.`);
  }

  console.log(`✨ Total ${campaigns.length} campañas sincronizadas para despliegue.`);
}

main().catch(err => {
  console.error('❌ Build failure:', err);
  process.exit(1);
});
