import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// Twitter card dimensions (1200x675 for optimal Twitter sharing)
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

/**
 * Render options for the tweet card
 */
export interface RenderOptions {
  text: string;
  name: string;
  handle: string;
  avatarUrl: string;
  isVerified: boolean;
  createdAt: string;
  hue: number; // 0-360
}

/**
 * Generate gradient colors from a hue value
 * Creates a dramatic gradient shift from hue to hue+80
 */
function getGradientColors(hue: number): { start: string; end: string } {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const endHue = (normalizedHue + 80) % 360;
  
  return {
    start: `hsl(${normalizedHue}, 75%, 55%)`,
    end: `hsl(${endHue}, 85%, 35%)`,
  };
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
    // Replace comma between date and time with " ·"
    return formatted.replace(/,\s*(\d)/, " · $1");
  } catch {
    return createdAt;
  }
}

/**
 * Load a font from Google Fonts CDN
 * We'll use Inter for clean, modern typography
 */
async function loadFont(): Promise<ArrayBuffer> {
  // Use Inter font from Google Fonts
  const response = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
  );
  return response.arrayBuffer();
}

// Satori element type - uses a specific format different from React
type SatoriChild = SatoriElement | string;
interface SatoriElement {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriChild | SatoriChild[];
    [key: string]: unknown;
  };
}

// Twitter verified badge PNG as base64 data URL
const VERIFIED_BADGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAABklBMVEUAAAAAgP8envMcm/Eemu0cmPEdm/Adm/AAqv8em+8dm/Adm+8rqv8dnPEcm+8kkv8dm/Eem+8gn/8elvAUnescmvAdm/AVleodmvEdmvAdm/Adm/Adm/Acm/AdnPAdm/Adm/Adm/Adm/AdnfAbm+0dmvAcl+wem/Adm/Adm/AfmfAcnPEdm/AdnPAdm/Adm/AcnPEamfIcjuMdm/Adm/Adm/Adm/Abne8dmvAdm/Aem/Adm/Adm/Edm/AemvAdnPEcm/Adm/Adm/Edm/EanfIcnPEem/Acm/AdmfAenPAdm/Adm+8enPAdmvEdmu8A//8dm/Adm/Eem/AcnPEfm/MdnPAime4bmvIdm/AcnPEdm/AgmfIcmvEdm/Adm/Acm/Adm/AdmvEdnPAem/Azmf8ame4dm/Acm+8ameYem/AcnPEenvAdm/Adm/Edm/Adm/Eem+8cnPEdmvEenPAdnfAdm/AfmfUdm/Adm/AfnO8dm/Acm/AhnO8dnesdm/Adm/AemvAXougcmu8dnPAdm/D///8TtvF5AAAAhHRSTlMAAipKKyWW7QOA+YIGsbMHoKMIEQ1TVww1mNz+66vf4arq3TQcrxsz6OcyNpfa/P0SFAnky/jJQfGoVN7U7Faf4OOhsCd+8pkjQ4SUVWqTAcrlZlopyA8me0j6KEnN886lR3S1BR5pxQrYJCK7falrpGxYrEb2GdnvMa7pHxqt4kQLopW//I4JAAAAAWJLR0SFFddq5wAAAAd0SU1FB+gJAhIDAktb3EQAAAJ/SURBVFjD7Vf7QxJBEF4gnkGpaKhHISYoUYEWpZmaiaZhnr0j7K1WavbWTLPX/OHBHd7dLrPLHvSj3y93N7vfd7uzs7OzhBxCDIfT5TriaJju9nihDK/H3RDd5w9AFYGjPvv8YAgsOHbctkALUGi1QW0LtxPSAQxOEBIJt9Vnd3Z1KwDRk6dYgVhPHEDp7TotpPeFoC4SST6/fwAkkOrn/j8FUkjxxpAASSRw/hmQRhoV8MgLnEUFzskLdKOxe15eIINFdhZsYBARGFJsCLRjc7ggpFzMWT4GUCe2iviXIpeHza8RjH9lVMC/miUkPWburPHaNZgQ/f9aX6WPc9K0XA8y2XNKxI/n9SRn3ashOstNi/gz1Rxwg7L6rfzZnICfm9M73aTNgVmLQEEUdfN6n1tsw4LJV6NM2+Jt8/2O3uduhhWIqobAPabp/oOHhsIjvUvxce3YSobAEt3wpLzo7mpcFvQe6afI5IqGQJGyP8tq55qm8Fw/GJ1ezDsvDIESZX+pGyuzeLWsva5Mou7Nm06MW+3K6oHC6zfay+BbPLxMJ5IFwBTWwtojsoivr2UZyXoOVdB3yQbOpwKJvAOegmOTE2B+ejMleAq8XD3lE2/nAwU/h98SrMkIHaOIwnucHpvHUtIHZgwfCfmUwQU+E5mkqqx+CXAmMKxKpXXlK3ePJ5s9WNxNHm2whflgW57/DfOBMK8x6EFXYUdeYA4vUb7L8jc4NVJSssja3eOWeVIKu4Ja88e+xPj3hLXqTmG7HA+pkRjL+7k/U1m/zV8ShX74NyHjSLGdXN+yUbP/abzc/08XjqavPJVDv6AdumN/1xq+t6n5JVdJPbz+1sE/U1vbLwhskpcAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjQtMDktMDJUMTg6MDM6MDErMDA6MDCDks/gAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI0LTA5LTAyVDE4OjAzOjAxKzAwOjAw8s93XAAAAABJRU5ErkJggg==";

/**
 * Create the tweet card element for Satori
 * Note: Satori uses a subset of CSS, so we use inline styles
 */
function createTweetCard(options: RenderOptions): SatoriElement {
  const { text, name, handle, avatarUrl, isVerified, createdAt, hue } = options;
  const { start, end } = getGradientColors(hue);
  const formattedDate = formatTweetDate(createdAt);

  // Build name row with optional verified badge
  const nameChildren: (SatoriElement | string)[] = [name];
  if (isVerified) {
    nameChildren.push({
      type: "img",
      props: {
        src: VERIFIED_BADGE_DATA_URL,
        width: 22,
        height: 22,
        style: {
          marginLeft: "6px",
        },
      },
    });
  }

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`,
        padding: "40px",
      },
      children: {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderRadius: "16px",
            padding: "32px",
            width: "100%",
            maxWidth: "1000px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          },
          children: [
            // Header with avatar and author info
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "flex-start",
                  marginBottom: "20px",
                },
                children: [
                  // Avatar
                  {
                    type: "img",
                    props: {
                      src: avatarUrl,
                      width: 52,
                      height: 52,
                      style: {
                        borderRadius: "50%",
                        marginRight: "14px",
                      },
                    },
                  },
                  // Name and handle column
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                      },
                      children: [
                        // Name with verified badge
                        {
                          type: "div",
                          props: {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              fontSize: "22px",
                              fontWeight: 700,
                              color: "#0f1419",
                            },
                            children: nameChildren,
                          },
                        },
                        // Handle
                        {
                          type: "span",
                          props: {
                            style: {
                              fontSize: "18px",
                              fontWeight: 400,
                              color: "#536471",
                              marginTop: "2px",
                            },
                            children: `@${handle}`,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Tweet text
            {
              type: "p",
              props: {
                style: {
                  fontSize: "28px",
                  lineHeight: 1.4,
                  color: "#0f1419",
                  margin: 0,
                  marginBottom: "20px",
                  wordBreak: "break-word",
                },
                children: text,
              },
            },
            // Date/time
            {
              type: "span",
              props: {
                style: {
                  fontSize: "16px",
                  color: "#536471",
                },
                children: formattedDate,
              },
            },
          ],
        },
      },
    },
  };
}

// Cache the font to avoid re-fetching
let fontCache: ArrayBuffer | null = null;

/**
 * Render a tweet card as a PNG buffer
 */
export async function renderTweetCard(options: RenderOptions): Promise<Buffer> {
  // Load font (cached after first load)
  if (!fontCache) {
    fontCache = await loadFont();
  }

  // Create the element for Satori
  const element = createTweetCard(options);

  // Render to SVG using Satori
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(element as any, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      {
        name: "Inter",
        data: fontCache,
        weight: 400,
        style: "normal",
      },
      {
        name: "Inter",
        data: fontCache,
        weight: 700,
        style: "normal",
      },
    ],
  });

  // Convert SVG to PNG using resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: CARD_WIDTH,
    },
  });

  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
