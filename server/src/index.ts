import express, { type Express, type Request, type Response } from "express";
import cors from "cors";

import { widgetsDevServer } from "skybridge/server";
import type { ViteDevServer } from "vite";
import { env } from "./env.js";
import { mcp } from "./middleware.js";
import server from "./server.js";
import { shareStore } from "./store.js";

const app = express() as Express & { vite: ViteDevServer };

// Enable CORS for potential API endpoints
app.use(cors());
app.use(express.json());

// Share page route - serves HTML with Open Graph tags for Twitter card previews
app.get("/share/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const share = shareStore.get(id);

  if (!share) {
    res.status(404).send("Share not found");
    return;
  }

  // Truncate text for description (Twitter limits to ~200 chars)
  const description = share.text.length > 200 
    ? share.text.substring(0, 197) + "..." 
    : share.text;

  // Remove trailing slash from PUBLIC_URL
  const baseUrl = env.PUBLIC_URL.replace(/\/$/, '');
  const sharePageUrl = `${baseUrl}/share/${share.id}`;

  // Serve HTML with Open Graph meta tags for Twitter/social sharing
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@${share.handle} on X</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${sharePageUrl}">
  <meta property="og:title" content="@${share.handle} on X">
  <meta property="og:description" content="${description.replace(/"/g, '&quot;')}">
  <meta property="og:image" content="${share.cloudinaryUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${sharePageUrl}">
  <meta name="twitter:title" content="@${share.handle} on X">
  <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}">
  <meta name="twitter:image" content="${share.cloudinaryUrl}">
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, hsl(${share.hue}, 70%, 60%), hsl(${(share.hue + 40) % 360}, 80%, 40%));
    }
    .card {
      max-width: 600px;
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
    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin-right: 12px;
    }
    .handle {
      font-weight: bold;
      color: #333;
    }
    .text {
      font-size: 18px;
      line-height: 1.5;
      color: #333;
    }
    .footer {
      margin-top: 16px;
      text-align: center;
    }
    .footer a {
      color: #1da1f2;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="avatar" src="${share.avatarUrl}" alt="@${share.handle}">
      <span class="handle">@${share.handle}</span>
    </div>
    <p class="text">${share.text}</p>
    <div class="footer">
      <a href="https://x.com/${share.handle}" target="_blank">View on X →</a>
    </div>
  </div>
</body>
</html>`;

  res.type("html").send(html);
});

// Mount the MCP handler
app.use(mcp(server));

// Enable Vite HMR in development
if (env.NODE_ENV !== "production") {
  app.use(await widgetsDevServer());
}

// Start the server
app.listen(3000, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }

  const serverBaseUrl = env.PUBLIC_URL.replace(/\/$/, '');
  console.log(`\n========================================`);
  console.log(`[INFO] Gradient Tweet MCP Server`);
  console.log(`========================================`);
  console.log(`[INFO] Environment: ${env.NODE_ENV}`);
  console.log(`[INFO] Port: 3000`);
  console.log(`[INFO] Public URL: ${serverBaseUrl}`);
  console.log(`[INFO] MCP Endpoint: ${serverBaseUrl}/mcp`);
  console.log(`[INFO] Share Route: ${serverBaseUrl}/share/:id`);
  console.log(`========================================\n`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Server shutdown complete");
  process.exit(0);
});

