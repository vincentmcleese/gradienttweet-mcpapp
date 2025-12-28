/**
 * Gradient Tweet Share Worker
 * 
 * Handles:
 * - POST /store - Store share data, return short URL
 * - GET /:id - Retrieve share data, render HTML with OG tags
 * - GET /?d=... - Legacy base64 encoded data (backwards compatible)
 */

// Generate a short unique ID (8 chars, URL-safe)
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    id += chars[randomBytes[i] % chars.length];
  }
  return id;
}

// Render the share page HTML
function renderSharePage(data, currentUrl) {
  const { img, handle, text, hue = 220 } = data;
  const title = `@${handle} on X`;
  const hue2 = (hue + 40) % 360;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${currentUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${escapeHtml(text)}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${currentUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${escapeHtml(text)}">
  <meta name="twitter:image" content="${img}">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
      background: linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${hue2}, 80%, 40%));
    }
    .card {
      max-width: 600px;
      width: 100%;
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .header {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    .handle {
      font-weight: bold;
      color: #333;
      font-size: 18px;
    }
    .text {
      font-size: 18px;
      line-height: 1.5;
      color: #333;
      margin-bottom: 16px;
      white-space: pre-wrap;
    }
    .image {
      width: 100%;
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .footer {
      text-align: center;
    }
    .footer a {
      color: #1da1f2;
      text-decoration: none;
      font-weight: 500;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="handle">@${escapeHtml(handle)}</span>
    </div>
    <p class="text">${escapeHtml(text)}</p>
    <img class="image" src="${img}" alt="Tweet image">
    <div class="footer">
      <a href="https://x.com/${handle}" target="_blank">View @${escapeHtml(handle)} on X →</a>
    </div>
  </div>
</body>
</html>`;
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render error page
function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Share Not Found</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
    }
    .card {
      max-width: 400px;
      width: 100%;
      background: white;
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h2 { color: #333; margin-bottom: 12px; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Share Not Found</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

// CORS headers for API requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /store - Store share data and return short URL
    if (request.method === 'POST' && url.pathname === '/store') {
      try {
        const data = await request.json();
        
        // Validate required fields
        if (!data.img || !data.handle) {
          return Response.json(
            { error: 'Missing required fields: img, handle' },
            { status: 400, headers: corsHeaders }
          );
        }

        // Generate short ID and store
        const id = generateShortId();
        await env.SHARES.put(id, JSON.stringify(data), {
          expirationTtl: 60 * 60 * 24 * 90 // 90 days
        });

        const shareUrl = `${url.origin}/${id}`;
        
        return Response.json(
          { id, url: shareUrl },
          { headers: corsHeaders }
        );
      } catch (error) {
        return Response.json(
          { error: 'Failed to store share data' },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // GET /?d=... - Legacy base64 encoded data (backwards compatible)
    const encodedData = url.searchParams.get('d');
    if (encodedData) {
      try {
        const json = atob(encodedData.replace(/-/g, '+').replace(/_/g, '/'));
        const data = JSON.parse(json);
        return new Response(renderSharePage(data, url.href), {
          headers: { 'Content-Type': 'text/html' }
        });
      } catch {
        return new Response(renderErrorPage('Invalid share link format.'), {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }

    // GET /:id - Retrieve share data and render page
    const id = url.pathname.slice(1); // Remove leading /
    if (id && id.length > 0 && id.length <= 12) {
      const dataStr = await env.SHARES.get(id);
      
      if (!dataStr) {
        return new Response(renderErrorPage('This share link has expired or does not exist.'), {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        });
      }

      try {
        const data = JSON.parse(dataStr);
        return new Response(renderSharePage(data, url.href), {
          headers: { 'Content-Type': 'text/html' }
        });
      } catch {
        return new Response(renderErrorPage('Failed to load share data.'), {
          status: 500,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }

    // GET / - Landing page (optional - could redirect somewhere)
    if (url.pathname === '/') {
      return new Response(renderErrorPage('No share ID provided. Use a valid share link.'), {
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

