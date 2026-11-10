import type { Context } from "@netlify/edge-functions";

const SUPABASE_URL = "https://ioghcoouqehcpplhspyd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZ2hjb291cWVoY3BwbGhzcHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQ1NDksImV4cCI6MjA3NTQzMDU0OX0.4ynUrBlb1eMZA5gptIxjunfveIwTdVDpSRjeF2mc-g0";

const CORPORATE_OG_IMAGE = "https://www.recienabierto.com/og-recien-abierto.jpg";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_REGEX = /^[0-9a-f]{64}$/i;

interface PromoData {
  id?: string | null;
  title?: string | null;
  prize?: string | null;
  description?: string | null;
  image_url?: string | null;
  business_id?: string | null;
  business_name?: string | null;
  business_image_url?: string | null;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanDescription(text: string, maxLength = 240): string {
  if (!text) return "";
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[#*_`]/g, "")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 1).trim() + "…";
}

async function fetchPromotionMetadata(
  promoId: string | null,
  referralToken: string | null,
  businessId: string | null
): Promise<PromoData | null> {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Intento principal: RPC get_promotion_public_og
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_promotion_public_og`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_promo_id: promoId || null,
        p_referral_token: referralToken || null,
        p_business_id: businessId || null,
      }),
    });
    if (rpcRes.ok) {
      const data = await rpcRes.json();
      if (data && (data.id || data.title || data.business_name)) {
        return data as PromoData;
      }
    }
  } catch (_e) {
    // Si la RPC no responde, continuar al fallback directo REST
  }

  // 2. Fallback REST por promoId
  if (promoId) {
    try {
      const promoRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promotions?id=eq.${encodeURIComponent(promoId)}&select=id,title,prize,description,image_url,business_id`,
        { headers }
      );
      if (promoRes.ok) {
        const promos = await promoRes.json();
        if (Array.isArray(promos) && promos.length > 0) {
          const promo = promos[0];
          let bizName: string | null = null;
          let bizImg: string | null = null;
          if (promo.business_id) {
            try {
              const bRes = await fetch(
                `${SUPABASE_URL}/rest/v1/businesses_v2?id=eq.${encodeURIComponent(promo.business_id)}&select=name,image_url`,
                { headers }
              );
              if (bRes.ok) {
                const bList = await bRes.json();
                if (bList.length > 0) {
                  bizName = bList[0].name;
                  bizImg = bList[0].image_url;
                }
              }
            } catch (_err) {}
          }
          return {
            id: promo.id,
            title: promo.title,
            prize: promo.prize,
            description: promo.description,
            image_url: promo.image_url,
            business_id: promo.business_id,
            business_name: bizName,
            business_image_url: bizImg,
          };
        }
      }
    } catch (_err) {}
  }

  // 3. Fallback REST por businessId
  if (businessId) {
    try {
      // Buscar sorteo activo del negocio
      const promoRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promotions?business_id=eq.${encodeURIComponent(businessId)}&is_active=eq.true&order=starts_at.desc&limit=1&select=id,title,prize,description,image_url,business_id`,
        { headers }
      );
      const bizRes = await fetch(
        `${SUPABASE_URL}/rest/v1/businesses_v2?id=eq.${encodeURIComponent(businessId)}&select=name,image_url,description`,
        { headers }
      );
      let bizName: string | null = null;
      let bizImg: string | null = null;
      let bizDesc: string | null = null;
      if (bizRes.ok) {
        const bList = await bizRes.json();
        if (bList.length > 0) {
          bizName = bList[0].name;
          bizImg = bList[0].image_url;
          bizDesc = bList[0].description;
        }
      }

      if (promoRes.ok) {
        const promos = await promoRes.json();
        if (Array.isArray(promos) && promos.length > 0) {
          const promo = promos[0];
          return {
            id: promo.id,
            title: promo.title,
            prize: promo.prize,
            description: promo.description,
            image_url: promo.image_url,
            business_id: promo.business_id,
            business_name: bizName,
            business_image_url: bizImg,
          };
        }
      }

      if (bizName) {
        return {
          id: null,
          title: bizName,
          prize: null,
          description: bizDesc,
          image_url: null,
          business_id: businessId,
          business_name: bizName,
          business_image_url: bizImg,
        };
      }
    } catch (_err) {}
  }

  return null;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const pathname = url.pathname.toLowerCase();

  // Excluir assets estáticos y archivos físicos
  if (
    pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico|css|js|map|json|txt|xml|woff|woff2)$/i) ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return context.next();
  }

  const isSorteosRoot = pathname === "/sorteos" || pathname === "/sorteos/" || pathname === "/sorteo" || pathname === "/sorteo/";
  const isSorteoSubpath = pathname.startsWith("/sorteos/") || pathname.startsWith("/sorteo/");
  const isNegocioPath = pathname.startsWith("/negocio/");

  // Si no es ni sorteos ni negocio, continuar sin modificar
  if (!isSorteosRoot && !isSorteoSubpath && !isNegocioPath) {
    return context.next();
  }

  // 1. Extraer identificadores del request
  let promoId: string | null = null;
  let referralToken: string | null = null;
  let businessId: string | null = null;

  const queryPromo = url.searchParams.get("promo") || url.searchParams.get("id");
  if (queryPromo && UUID_REGEX.test(queryPromo.trim())) {
    promoId = queryPromo.trim().toLowerCase();
  }

  const queryRef = url.searchParams.get("ref");
  if (queryRef && TOKEN_REGEX.test(queryRef.trim())) {
    referralToken = queryRef.trim().toLowerCase();
  }

  if (isSorteoSubpath) {
    const match = pathname.match(/^\/sorteos?\/([a-f0-9-]{36})/i);
    if (match && UUID_REGEX.test(match[1])) {
      promoId = match[1].toLowerCase();
    }
  } else if (isNegocioPath) {
    const match = pathname.match(/^\/negocio\/([^\/?#]+)/i);
    if (match) {
      businessId = match[1];
    }
  }

  // Si es la raíz de /sorteos y NO tiene promoId ni token, es el escaparate general
  if (isSorteosRoot && !promoId && !referralToken) {
    return context.next();
  }

  // 2. Resolver metadatos dinámicos desde Supabase
  const promoData = await fetchPromotionMetadata(promoId, referralToken, businessId);

  // 3. Continuar la cadena de Netlify para obtener el HTML base (sorteos/index.html o redirect.html)
  const response = await context.next();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }

  let html = await response.text();

  // 4. Determinar campos Open Graph según la prioridad estricta requerida:
  //    Prioridad imagen: 1) promotions.image_url, 2) negocios.image_url, 3) CORPORATE_OG_IMAGE
  let ogTitle = "Recién Abierto";
  let ogDesc = "Descubre las últimas novedades, aperturas y sorteos en tu ciudad.";
  let ogImage = CORPORATE_OG_IMAGE;
  let ogUrl = url.href;

  if (promoData) {
    const isGiveaway = !!(promoData.id || promoData.prize);

    if (isGiveaway) {
      ogTitle = promoData.title || `Sorteo en Recién Abierto`;
      if (promoData.prize && promoData.prize.trim()) {
        ogDesc = `🎁 Gana: ${cleanDescription(promoData.prize)}`;
      } else if (promoData.description && promoData.description.trim()) {
        ogDesc = cleanDescription(promoData.description);
      } else {
        ogDesc = "Participa gratis en este sorteo exclusivo desde la aplicación Recién Abierto.";
      }
    } else if (promoData.business_name) {
      ogTitle = `${promoData.business_name} · Recién Abierto`;
      ogDesc = cleanDescription(
        promoData.description || "Descubre esta novedad y participa en planes exclusivos en Recién Abierto."
      );
    }

    // Jerarquía de imagen obligatoria:
    // 1) promotions.image_url (siempre que no sea portada obsoleta de SoundCloud)
    // 2) negocios.image_url (ficha del evento / negocio en alta definición)
    // 3) CORPORATE_OG_IMAGE
    let chosenImg = promoData.image_url && promoData.image_url.trim();
    if ((!chosenImg || chosenImg.includes("sndcdn.com")) && promoData.business_image_url && promoData.business_image_url.trim()) {
      chosenImg = promoData.business_image_url.trim();
    }

    if (chosenImg) {
      ogImage = chosenImg;
    } else if (promoData.business_image_url && promoData.business_image_url.trim()) {
      ogImage = promoData.business_image_url.trim();
    } else {
      ogImage = CORPORATE_OG_IMAGE;
    }

    if (isSorteoSubpath && promoData.id) {
      ogUrl = `https://www.recienabierto.com/sorteos/${promoData.id}`;
    }
  }

  // 5. Inyectar / reemplazar metadatos en el <head>
  const escapedTitle = escapeHtml(ogTitle);
  const escapedDesc = escapeHtml(ogDesc);
  const escapedImage = escapeHtml(ogImage);
  const escapedUrl = escapeHtml(ogUrl);

  // Actualizar <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);

  // Actualizar o reemplazar meta description
  if (/<meta\s+name=["']description["']/i.test(html)) {
    html = html.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      `<meta name="description" content="${escapedDesc}">`
    );
  }

  // Reemplazar o insertar bloque Open Graph y Twitter Cards limpio
  const dynamicMetaBlock = `
  <!-- Metadatos dinámicos Open Graph / WhatsApp / Telegram / Redes Sociales -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Recién Abierto">
  <meta property="og:url" content="${escapedUrl}">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDesc}">
  <meta property="og:image" content="${escapedImage}">
  <meta property="og:image:secure_url" content="${escapedImage}">
  <meta property="og:image:alt" content="${escapedTitle}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapedUrl}">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDesc}">
  <meta name="twitter:image" content="${escapedImage}">
  <link rel="canonical" href="${escapedUrl}">
`;

  // Eliminar etiquetas OG y twitter previas para evitar duplicidades
  html = html
    .replace(/<meta\s+property=["']og:[^"']*["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");

  // Insertar justo después de <head>
  html = html.replace(/<head>/i, `<head>\n${dynamicMetaBlock}`);

  const newHeaders = new Headers(response.headers);
  // Cache de 60s en CDN para permitir actualizaciones inmediatas en Supabase sin build de Netlify
  newHeaders.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
  newHeaders.set("Content-Type", "text/html; charset=UTF-8");

  return new Response(html, {
    status: response.status,
    headers: newHeaders,
  });
};
