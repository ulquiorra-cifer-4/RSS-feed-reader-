const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
  },
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
      ["media:group", "mediaGroup"],
      ["enclosure", "enclosure"],
      ["dc:creator", "creator"],
    ],
  },
});

// Each source has a primary URL and optional fallbacks
const FEEDS = {
  tech: [
    {
      name: "The Verge",
      urls: ["https://www.theverge.com/rss/index.xml"],
    },
    {
      name: "Ars Technica",
      urls: [
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://arstechnica.com/feed/",
      ],
    },
    {
      name: "Wired",
      urls: ["https://www.wired.com/feed/rss"],
    },
    {
      name: "TechCrunch",
      urls: ["https://techcrunch.com/feed/"],
    },
    {
      name: "Hacker News",
      urls: ["https://news.ycombinator.com/rss"],
    },
  ],
  gaming: [
    {
      name: "IGN",
      urls: [
        "https://feeds.ign.com/ign/all",
        "http://feeds.ign.com/ign/all",
        "https://ign.com/rss/articles.xml",
      ],
    },
    {
      name: "Kotaku",
      urls: ["https://kotaku.com/rss"],
    },
    {
      name: "Polygon",
      urls: ["https://www.polygon.com/rss/index.xml"],
    },
    {
      name: "GameSpot",
      urls: [
        "https://www.gamespot.com/feeds/mashup/",
        "https://www.gamespot.com/feeds/news",
      ],
    },
    {
      name: "Rock Paper Shotgun",
      urls: [
        "https://www.rockpapershotgun.com/feed",
        "http://feeds.feedburner.com/RockPaperShotgun",
      ],
    },
    {
      name: "Eurogamer",
      urls: ["https://www.eurogamer.net/?format=rss"],
    },
    {
      name: "PC Gamer",
      urls: ["https://www.pcgamer.com/rss/"],
    },
  ],
  rockstar: [
    {
      name: "Rockstar Newswire",
      urls: ["https://www.rockstargames.com/newswire/rss"],
    },
  ],
  capcom: [
    {
      name: "Capcom-Unity",
      urls: ["https://www.capcom-unity.com/feed/"],
    },
  ],
  activision: [
    {
      name: "Call of Duty Blog",
      urls: [
        "https://www.callofduty.com/blog/feed",
        "https://blog.activision.com/feed",
      ],
    },
  ],
  cdpr: [
    {
      name: "CD Projekt Red",
      urls: ["https://www.cdprojektred.com/en/feed"],
    },
    {
      name: "CD Projekt Blog",
      urls: ["https://www.cdprojekt.com/en/feed/"],
    },
  ],
  ai: [
    {
      name: "MIT Tech Review AI",
      urls: [
        "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
        "https://www.technologyreview.com/feed/",
      ],
    },
    {
      name: "VentureBeat AI",
      urls: [
        "https://venturebeat.com/category/ai/feed/",
        "https://feeds.feedburner.com/venturebeat/SZYF",
      ],
    },
    {
      name: "The Gradient",
      urls: ["https://thegradient.pub/rss/"],
    },
  ],
};

// ── THUMBNAIL EXTRACTION ─────────────────────────────────────────────────────
function extractThumbnail(item) {
  // 1. media:thumbnail
  if (item.mediaThumbnail) {
    const t = item.mediaThumbnail;
    if (t?.$ && t.$.url) return t.$.url;
    if (Array.isArray(t) && t[0]?.$ && t[0].$.url) return t[0].$.url;
  }

  // 2. media:content
  if (item.mediaContent) {
    const c = item.mediaContent;
    const url = c?.$ && c.$.url;
    const type = c?.$ && c.$.type;
    if (url && (!type || type.startsWith("image"))) return url;
    if (Array.isArray(c)) {
      for (const mc of c) {
        if (mc?.$ && mc.$.url && (!mc.$.type || mc.$.type.startsWith("image"))) return mc.$.url;
      }
    }
  }

  // 3. enclosure
  if (item.enclosure?.url && item.enclosure?.type?.startsWith("image")) {
    return item.enclosure.url;
  }

  // 4. media:group → media:content
  if (item.mediaGroup) {
    const g = Array.isArray(item.mediaGroup) ? item.mediaGroup[0] : item.mediaGroup;
    if (g?.["media:content"]) {
      const mc = g["media:content"];
      const arr = Array.isArray(mc) ? mc : [mc];
      for (const m of arr) {
        if (m?.$ && m.$.url) return m.$.url;
      }
    }
  }

  // 5. Scrape first <img> from content
  const html = item["content:encoded"] || item.content || item.summary || "";
  if (html) {
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && m[1] && !m[1].includes("pixel") && !m[1].includes("tracking")) return m[1];
  }

  return null;
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

// ── FETCH WITH FALLBACK ───────────────────────────────────────────────────────
async function fetchFeedWithFallback(feedDef) {
  let lastErr = null;
  for (const url of feedDef.urls) {
    try {
      const feed = await parser.parseURL(url);
      const items = (feed.items || []).slice(0, 12).map((item) => ({
        title: item.title || "Untitled",
        link: item.link || item.guid || "#",
        pubDate: item.pubDate || item.isoDate || null,
        summary:
          item.contentSnippet ||
          stripHtml(item["content:encoded"] || item.content || item.summary || ""),
        thumbnail: extractThumbnail(item),
        author: item.creator || item.author || feedDef.name,
        source: feedDef.name,
      }));
      return { source: feedDef.name, items, error: null };
    } catch (err) {
      lastErr = err;
      console.warn(`[${feedDef.name}] Failed ${url}: ${err.message}`);
    }
  }
  console.error(`[${feedDef.name}] All URLs failed: ${lastErr?.message}`);
  return { source: feedDef.name, items: [], error: lastErr?.message || "Failed" };
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).end();
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const channel = req.query.channel || "all";

  let feedDefs = [];
  if (channel === "all") {
    feedDefs = Object.values(FEEDS).flat();
  } else if (FEEDS[channel]) {
    feedDefs = FEEDS[channel];
  } else {
    res.status(400).json({ error: "Unknown channel" });
    return;
  }

  // Fetch all in parallel
  const results = await Promise.allSettled(feedDefs.map(fetchFeedWithFallback));
  const feeds = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const totalArticles = feeds.reduce((n, f) => n + f.items.length, 0);
  const loadedFeeds = feeds.filter((f) => f.items.length > 0).length;

  res.status(200).json({
    feeds,
    meta: {
      channel,
      totalArticles,
      loadedFeeds,
      totalFeeds: feedDefs.length,
      timestamp: new Date().toISOString(),
    },
  });
};
 
