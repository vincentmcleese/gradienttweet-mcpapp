import { z } from "zod";
import { McpServer } from "skybridge/server";
import { fetchTweetAsync } from "./lib/apify.js";
import * as tweetCache from "./lib/tweet-cache.js";
import { uploadImage } from "./lib/cloudinary.js";
import { renderTweetCard } from "./lib/render.js";
import { env } from "./env.js";

// Simple logger
const log = {
  info: (msg: string, data?: unknown) => {
    console.log(`[INFO][MCP] ${msg}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
  },
  error: (msg: string, error?: unknown) => {
    console.error(`[ERROR][MCP] ${msg}`, error);
  },
};

const server = new McpServer(
  { name: "gradient-tweet", version: "0.0.1" },
  { capabilities: {} }
)
  // Fetch tweet data and display in widget (async - returns loading state immediately)
  .registerWidget(
    "tweet-card",
    { description: "Display a tweet with a customizable gradient background" },
    {
      description:
        "REQUIRED: Pass the tweet URL as the tweetUrl parameter. Fetches a tweet from Twitter/X and displays it with a customizable gradient background. The user MUST provide a tweet URL (e.g., https://x.com/username/status/123456). Extract the URL from the user's message and pass it as tweetUrl.",
      inputSchema: {
        tweetUrl: z
          .string()
          .url()
          .describe("REQUIRED: The full URL of the tweet (e.g., https://x.com/elonmusk/status/123456789)"),
      },
    },
    async ({ tweetUrl }) => {
      log.info(`tweet-card tool called`, { tweetUrl });
      
      // Generate a unique request ID
      const requestId = crypto.randomUUID();
      log.info(`Generated requestId: ${requestId}`);
      
      // Set loading state in cache
      tweetCache.setLoading(requestId);
      
      // Start async fetch (fire and forget - does NOT await)
      fetchTweetAsync(requestId, tweetUrl);
      log.info(`Started async fetch for requestId: ${requestId}`);
      
      // Return immediately with loading state
      const structuredContent = {
        requestId,
        status: "loading" as const,
        tweetUrl,
      };
      
      log.info(`tweet-card returning loading state:`, structuredContent);

      return {
        structuredContent,
        content: [
          {
            type: "text",
            text: `Loading tweet from ${tweetUrl}... The widget will update automatically when the data is ready.`,
          },
        ],
        isError: false,
      };
    }
  )
  // Check status of a pending tweet fetch request (for widget polling)
  .registerTool(
    "check-tweet-status",
    {
      description:
        "Check the status of a pending tweet fetch request. Used internally by the tweet-card widget to poll for data.",
      inputSchema: {
        requestId: z.string().describe("The request ID from the tweet-card widget"),
      },
    },
    async ({ requestId }) => {
      log.info(`check-tweet-status called`, { requestId });
      
      const entry = tweetCache.get(requestId);
      
      if (!entry) {
        log.info(`No cache entry found for requestId: ${requestId}`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "not_found" }),
            },
          ],
          isError: false,
        };
      }
      
      log.info(`Returning cache entry:`, entry);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(entry),
          },
        ],
        isError: false,
      };
    }
  )
  // Generate shareable image and return URL
  .registerTool(
    "generate-share",
    {
      description:
        "Generate a shareable gradient tweet image. Called when the user clicks the Post button in the tweet card widget.",
      inputSchema: {
        text: z.string().describe("The tweet text"),
        name: z.string().describe("The author's display name"),
        handle: z.string().describe("The Twitter handle (without @)"),
        avatarUrl: z.string().url().describe("URL to the user's avatar"),
        isVerified: z.boolean().describe("Whether the author is verified"),
        createdAt: z.string().describe("Tweet creation timestamp"),
        hue: z
          .number()
          .min(0)
          .max(360)
          .describe("The hue value for the gradient (0-360)"),
      },
    },
    async ({ text, name, handle, avatarUrl, isVerified, createdAt, hue }) => {
      log.info(`generate-share tool called`, { text: text.substring(0, 50) + "...", name, handle, hue });
      try {
        // Render the tweet card as PNG
        log.info(`Rendering tweet card as PNG...`);
        const pngBuffer = await renderTweetCard({
          text,
          name,
          handle,
          avatarUrl,
          isVerified,
          createdAt,
          hue,
        });
        log.info(`PNG rendered, size: ${pngBuffer.length} bytes`);

        // Upload to Cloudinary
        log.info(`Uploading to Cloudinary...`);
        const uploadResult = await uploadImage(pngBuffer);
        log.info(`Cloudinary upload complete:`, uploadResult);

        // Store share data in Cloudflare Worker KV and get short URL
        const shareData = {
          img: uploadResult.secureUrl,
          handle,
          text: text.length > 150 ? text.substring(0, 147) + "..." : text,
          hue,
        };
        
        const baseUrl = env.SHARE_PAGE_URL.replace(/\/$/, '');
        log.info(`Storing share data at ${baseUrl}/store...`);
        
        const storeResponse = await fetch(`${baseUrl}/store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shareData),
        });
        
        if (!storeResponse.ok) {
          const errorText = await storeResponse.text();
          throw new Error(`Failed to store share data: ${storeResponse.status} ${errorText}`);
        }
        
        const { url: shareUrl } = await storeResponse.json() as { url: string };
        log.info(`Share URL: ${shareUrl}`);

        return {
          content: [
            {
              type: "text",
              text: `Your gradient tweet image is ready to share!\n\n🔗 Share URL: ${shareUrl}\n🖼️ Image URL: ${uploadResult.secureUrl}\n\nThis link includes Open Graph meta tags, so when you paste it on Twitter, the image will appear automatically.`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate share image";
        log.error(`generate-share error: ${message}`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error generating image: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

export default server;
export type AppType = typeof server;
