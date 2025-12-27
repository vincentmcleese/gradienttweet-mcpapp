import "dotenv/config";

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    VITE_DEV_SERVER_URL: z.string().url().optional(),
    
    // Apify - for fetching tweet data
    APIFY_API_TOKEN: z.string().min(1),
    
    // Cloudinary - for hosting generated images
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    
    // Public URL - for share page links (e.g., ngrok URL in dev)
    PUBLIC_URL: z.string().url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
