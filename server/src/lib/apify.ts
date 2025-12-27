import { ApifyClient } from "apify-client";
import { env } from "../env.js";
import * as tweetCache from "./tweet-cache.js";

// Simple logger with INFO level
const log = {
  info: (msg: string, data?: unknown) => {
    console.log(`[INFO][Apify] ${msg}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
  },
  error: (msg: string, error?: unknown) => {
    console.error(`[ERROR][Apify] ${msg}`, error);
  },
};

/**
 * Tweet data extracted from Apify response
 */
export interface TweetData {
  id: string;
  text: string;
  name: string; // Author's display name
  handle: string;
  avatarUrl: string;
  tweetUrl: string;
  createdAt: string;
  isVerified: boolean;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
}

/**
 * Raw tweet response from Apify actor
 */
interface ApifyTweetResponse {
  id: string | number;
  url: string;
  text: string;
  createdAt: string;
  // New format: nested author object
  author?: {
    profilePicture?: string;
    userName?: string;
    name?: string;
    isBlueVerified?: boolean;
    isVerified?: boolean;
  };
  // Old format: flat key with dot
  "author.profilePicture"?: string;
  "author.name"?: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
}

// KaitoEasyAPI Twitter Scraper actor ID
const TWITTER_SCRAPER_ACTOR_ID = "CJdippxWmn9uRfooo";

/**
 * Extract tweet ID from a Twitter/X URL
 * Supports formats:
 * - https://twitter.com/user/status/123456789
 * - https://x.com/user/status/123456789
 */
export function extractTweetId(url: string): string | null {
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      log.info(`Extracted tweet ID: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }

  log.error(`Failed to extract tweet ID from URL: ${url}`);
  return null;
}

/**
 * Extract handle from tweet URL
 * e.g., https://x.com/elonmusk/status/123 → elonmusk
 */
export function extractHandleFromUrl(url: string): string {
  const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status/i);
  const handle = match ? match[1] : "unknown";
  log.info(`Extracted handle: @${handle}`);
  return handle;
}

/**
 * Fetch tweet data from Apify
 */
export async function fetchTweet(tweetUrl: string): Promise<TweetData> {
  log.info(`fetchTweet called with URL: ${tweetUrl}`);
  
  const tweetId = extractTweetId(tweetUrl);
  
  if (!tweetId) {
    log.error(`Invalid tweet URL: ${tweetUrl}`);
    throw new Error(`Invalid tweet URL: ${tweetUrl}`);
  }

  log.info(`Creating Apify client (token: ${env.APIFY_API_TOKEN.substring(0, 8)}...)`);
  const client = new ApifyClient({
    token: env.APIFY_API_TOKEN,
  });

  // Minimal input - just the tweet ID
  const input = {
    tweetIDs: [tweetId],
    maxItems: 1,
  };
  log.info(`Calling actor ${TWITTER_SCRAPER_ACTOR_ID} with input:`, input);

  try {
    // Run the actor and wait for it to finish
    const run = await client.actor(TWITTER_SCRAPER_ACTOR_ID).call(input);
    log.info(`Actor run completed. Run ID: ${run.id}, Dataset ID: ${run.defaultDatasetId}`);

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    log.info(`Raw response (${items.length} items):`, items);

    // Filter out mock data (id === -1) and find the matching tweet
    const validTweets = items.filter((item) => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      const isValid = "id" in record && record.id !== -1 && String(record.id) !== "-1";
      log.info(`Item id=${record.id}, valid=${isValid}`);
      return isValid;
    });

    log.info(`Valid tweets after filtering: ${validTweets.length}`);

    if (validTweets.length === 0) {
      log.error(`No valid tweets found for ID: ${tweetId}`);
      throw new Error(`Tweet not found: ${tweetId}`);
    }

    const tweet = validTweets[0] as unknown as ApifyTweetResponse;
    
    // Handle both nested and flat author formats
    const handle = tweet.author?.userName || extractHandleFromUrl(tweet.url);
    const avatarUrl = tweet.author?.profilePicture || tweet["author.profilePicture"] || "";
    const name = tweet.author?.name || tweet["author.name"] || handle; // Fallback to handle if no name
    const isVerified = tweet.author?.isBlueVerified || tweet.author?.isVerified || false;

    const result: TweetData = {
      id: String(tweet.id),
      text: tweet.text,
      name,
      handle,
      avatarUrl,
      tweetUrl: tweet.url,
      createdAt: tweet.createdAt,
      isVerified,
      likeCount: tweet.likeCount ?? 0,
      retweetCount: tweet.retweetCount ?? 0,
      replyCount: tweet.replyCount ?? 0,
    };

    log.info(`Returning tweet data:`, result);
    return result;
  } catch (error) {
    log.error(`Error fetching tweet:`, error);
    throw error;
  }
}

/**
 * Fetch tweet data asynchronously in the background
 * Stores result in cache when complete - does NOT await
 */
export function fetchTweetAsync(requestId: string, tweetUrl: string): void {
  log.info(`fetchTweetAsync started for requestId: ${requestId}, URL: ${tweetUrl}`);
  
  // Fire and forget - don't await
  fetchTweet(tweetUrl)
    .then((data) => {
      log.info(`fetchTweetAsync completed for requestId: ${requestId}`);
      tweetCache.setReady(requestId, data);
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`fetchTweetAsync failed for requestId: ${requestId}`, error);
      tweetCache.setError(requestId, errorMessage);
    });
}
