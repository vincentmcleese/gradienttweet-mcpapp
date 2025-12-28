import "@/index.css";
import { useState, useEffect, useRef } from "react";
import { mountWidget, useTheme } from "skybridge/web";
import { useToolInfo, useCallTool } from "../helpers";

/**
 * Tweet data structure (matches server TweetData interface)
 */
interface TweetData {
  id: string;
  text: string;
  name: string;
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
 * Cache entry from server
 */
interface CacheEntry {
  status: "loading" | "ready" | "error" | "not_found";
  data?: TweetData;
  error?: string;
}

/**
 * Format tweet date for display
 * Input: "Sat Dec 27 15:34:36 +0000 2025"
 * Output: "Dec 27, 2025 · 3:34 PM"
 */
function formatTweetDate(createdAt: string): string {
  try {
    const date = new Date(createdAt);
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const formatted = date.toLocaleString("en-US", options);
    return formatted.replace(/,\s*(\d)/, " · $1");
  } catch {
    return createdAt;
  }
}

/**
 * Tweet Card Widget
 * 
 * Displays a tweet with a customizable gradient background.
 * Users can adjust the hue slider and generate a shareable image.
 */
function TweetCard() {
  // Get the initial tool output (contains requestId and status)
  const toolInfo = useToolInfo<"tweet-card">();
  
  // Theme from ChatGPT
  const theme = useTheme();
  const isDark = theme === "dark";
  
  // Hue state for gradient customization (0-360)
  const [hue, setHue] = useState(220); // Default blue-ish
  
  // Track the hue that was used for the last successful share generation
  // When hue changes after generation, the share URL becomes stale
  const [generatedHue, setGeneratedHue] = useState<number | null>(null);
  
  // Tweet data state (populated after polling succeeds)
  const [tweetData, setTweetData] = useState<TweetData | null>(null);
  
  // Loading/error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track polling state
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const hasLoadedRef = useRef(false);
  
  // Tool for checking tweet status (polling) - get data from the hook
  const { callTool: checkStatus, data: statusData } = useCallTool("check-tweet-status");
  
  // Tool for generating shareable image
  const { callTool: generateShare, isPending: isGeneratePending, data: shareResult } = useCallTool("generate-share");

  // Extract initial data from tool output
  const requestId = toolInfo.output?.requestId;
  const tweetUrl = toolInfo.output?.tweetUrl;
  const initialStatus = toolInfo.output?.status;

  // Process status data when it updates
  useEffect(() => {
    if (!statusData) return;
    
    try {
      const content = statusData.content as Array<{ type: string; text: string }> | undefined;
      const textContent = content?.[0];
      
      if (textContent?.type !== "text") return;
      
      const entry: CacheEntry = JSON.parse(textContent.text);
      
      if (entry.status === "ready" && entry.data) {
        hasLoadedRef.current = true;
        setTweetData(entry.data);
        setIsLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else if (entry.status === "error") {
        hasLoadedRef.current = true;
        setError(entry.error || "Failed to load tweet");
        setIsLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else if (entry.status === "not_found") {
        hasLoadedRef.current = true;
        setError("Request not found");
        setIsLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err) {
      console.error("Error parsing status data:", err);
    }
  }, [statusData]);

  // Start polling when component mounts with loading status
  useEffect(() => {
    if (hasLoadedRef.current || initialStatus !== "loading" || !requestId) {
      return;
    }
    
    const initialTimeout = setTimeout(() => {
      if (!hasLoadedRef.current) {
        checkStatus({ requestId });
      }
    }, 1000);
    
    pollIntervalRef.current = setInterval(() => {
      if (hasLoadedRef.current) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
      
      pollCountRef.current++;
      
      if (pollCountRef.current >= 30) {
        hasLoadedRef.current = true;
        setError("Loading took too long. Please try again.");
        setIsLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
      
      checkStatus({ requestId });
    }, 2000);
    
    return () => {
      clearTimeout(initialTimeout);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatus, requestId]);

  // Generate gradient colors from hue (80° shift for more dramatic color variation)
  const gradientStart = `hsl(${hue}, 75%, 55%)`;
  const gradientEnd = `hsl(${(hue + 80) % 360}, 85%, 35%)`;

  // Extract share URL and image URL from result if available
  const resultText = shareResult?.content?.[0]?.type === "text" 
    ? shareResult.content[0].text 
    : null;
  
  const rawShareUrl = resultText?.match(/🔗 Share URL: (https?:\/\/[^\s]+)/)?.[1] ?? null;
  const rawImageUrl = resultText?.match(/🖼️ Image URL: (https?:\/\/[^\s]+)/)?.[1] ?? null;
  
  // URLs are only valid if hue hasn't changed since generation
  const isShareValid = rawShareUrl && generatedHue !== null && hue === generatedHue;
  const shareUrl = isShareValid ? rawShareUrl : null;
  const imageUrl = isShareValid ? rawImageUrl : null;

  // Handle Generate button click
  const handleGenerate = () => {
    if (!tweetData) return;
    
    generateShare({
      text: tweetData.text,
      name: tweetData.name,
      handle: tweetData.handle,
      avatarUrl: tweetData.avatarUrl,
      isVerified: tweetData.isVerified,
      createdAt: tweetData.createdAt,
      hue,
    });
    
    // Track the hue used for this generation
    setGeneratedHue(hue);
  };

  // Theme-aware classes
  const textSecondary = isDark ? "text-gray-400" : "text-gray-500";
  const bgControls = isDark ? "bg-white/10" : "bg-black/5";

  return (
    <div className="font-sans p-4 w-full min-w-0 overflow-hidden">
      {/* Loading State */}
      {isLoading && (
        <div 
          className="aspect-[1200/675] rounded-lg flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
          }}
        >
          <div className="bg-white/95 rounded-lg p-8 flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="text-gray-600 font-medium text-sm">Loading tweet...</p>
            {tweetUrl && (
              <p className="text-gray-400 text-xs mt-2 break-all max-w-xs text-center">
                {tweetUrl}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div 
          className="aspect-[1200/675] rounded-lg flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
          }}
        >
          <div className="bg-white/95 rounded-lg p-8 flex flex-col items-center">
            <div className="text-3xl mb-3">⚠️</div>
            <p className="text-red-600 font-medium text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Tweet Card (only when data is loaded) */}
      {tweetData && !isLoading && (
        <>
          {/* Gradient Card Container - 1200x675 aspect ratio */}
          <div 
            className="aspect-[1200/675] rounded-lg p-6 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
            }}
          >
            {/* White Tweet Card */}
            <div className="bg-white/95 rounded-lg p-5 w-full max-w-lg shadow-xl">
              {/* Author Row */}
              <div className="flex items-start mb-3">
                {tweetData.avatarUrl && (
                  <img
                    src={tweetData.avatarUrl}
                    alt={tweetData.name}
                    className="w-11 h-11 rounded-full mr-3 flex-shrink-0"
                  />
                )}
                <div className="flex flex-col min-w-0">
                  {/* Name with verified badge */}
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-900 text-sm truncate">
                      {tweetData.name}
                    </span>
                    {tweetData.isVerified && (
                      <svg viewBox="0 0 22 22" className="w-4 h-4 flex-shrink-0">
                        <path
                          fill="#1D9BF0"
                          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
                        />
                      </svg>
                    )}
                  </div>
                  {/* Handle */}
                  <span className="text-gray-500 text-sm">
                    @{tweetData.handle}
                  </span>
                </div>
              </div>

              {/* Tweet Text */}
              <p className="text-gray-900 text-base leading-relaxed mb-3">
                {tweetData.text}
              </p>

              {/* Date/Time */}
              <span className="text-gray-500 text-xs">
                {formatTweetDate(tweetData.createdAt)}
              </span>
            </div>
          </div>

          {/* Controls - Outside gradient, transparent background */}
          <div className="mt-4 space-y-3">
            {/* Hue Slider */}
            <div className={`${bgControls} rounded-lg p-3`}>
              <label className={`block text-xs font-medium mb-2 ${textSecondary}`}>
                Gradient Color
              </label>
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    hsl(0, 70%, 60%), 
                    hsl(60, 70%, 60%), 
                    hsl(120, 70%, 60%), 
                    hsl(180, 70%, 60%), 
                    hsl(240, 70%, 60%), 
                    hsl(300, 70%, 60%), 
                    hsl(360, 70%, 60%)
                  )`,
                }}
              />
            </div>

            {/* Action Button - changes based on state */}
            {shareUrl ? (
              // Share ready: Black "Share on X" button + download link
              <div className="space-y-2">
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all bg-black text-white hover:bg-gray-800 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                  Share on X
                </a>
                {imageUrl && (
                  <p className="text-xs text-gray-400 text-left">
                    or download the image{" "}
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-gray-300"
                    >
                      here
                    </a>
                  </p>
                )}
              </div>
            ) : isGeneratePending ? (
              // Generating: Disabled button with spinner
              <button
                disabled
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gray-400 text-white cursor-wait flex items-center justify-center gap-2"
              >
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                Generating...
              </button>
            ) : (
              // Default: Black "Generate Gradient Tweet" button
              <button
                onClick={handleGenerate}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all bg-black text-white hover:bg-gray-800 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              >
                Generate Gradient Tweet
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default TweetCard;

// Mount the widget - required for Skybridge to render it
mountWidget(<TweetCard />);
