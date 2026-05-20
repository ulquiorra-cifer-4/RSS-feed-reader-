const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; RSSReader/1.0; +https://github.com/rss-reader)",
    Accept:
      "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
  },
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
      ["enclosure", "enclosure"],
      ["dc:creator", "creator"],
    ],
  },
});

// RSS feeds organized by channel
const FEEDS = {
  tech: [
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Wired", url: "https://www.wired.com/feed/rss" },
    { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { name: "Hacker News", url: "https://news.ycombinator.com/rss" },
  ],
  gaming: [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "Kotaku", url: "https://kotaku.com/rss" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
    { name: "Rock Paper Shotgun", url: "https://www.rockpapershotgun.com/feed" },
    { name: "Eurogamer", url: "https://www.eurogamer.net/?format=rss" },
  ],
  rockstar: [
    { name: "Rockstar News", url: "https://www.rockstargames.com/newswire/rss" },
    { name: "GTAForums", url: "https://gtaforums.com/forum/5-announcements-information.xml/" },
  ],
  capcom: [
    { name: "Capcom News", url: "https://www.capcom.com/us/feed.rss" },
  ],
  activision: [
    { name: "Call of Duty Blog", url: "https://www.callofduty.com/blog/feed" },
  ],
  cdpr: [
    { name: "CD Projekt Blog", url: "https://www.cdprojekt.com/en/feed/" },
  ],
  ai: [
    { name: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/" },
    { name: "VentureBeat AI", url: "https://feeds.feedburner.com/venturebeat/SZYF" },
  ],
};

async function fetchFeed(feedInfo) {
  try {
    const feed = await parser.parseURL(feedInfo.url);
    const items = (feed.items || []).slice(0, 10).map((item) => {
      // Extract thumbnail from various possible fields
      let thumbnail = null;
      if (item.mediaThumbnail?.$.url) thumbnail = item.mediaThumbnail.$.url;
      else if (item.mediaContent?.$.url) thumbnail = item.mediaContent.$.url;
      else if (item.enclosure?.url && item.enclosure.type?.startsWith("image"))
        thumbnail = item.enclosure.url;
      else if (item["media:thumbnail"]?.$.url)
        thumbnail = item["media:thumbnail"].$.url;

      // Try to extract image from content
      if (!thumbnail && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) thumbnail = imgMatch[1];
      }
      if (!thumbnail && item["content:encoded"]) {
        const imgMatch = item["content:encoded"].match(
          /<img[^>]+src=["']([^"']+)["']/i
        );
        if (imgMatch) thumbnail = imgMatch[1];
      }

      return {
        title: item.title || "Untitled",
        link: item.link || item.guid || "#",
        pubDate: item.pubDate || item.isoDate || null,
        summary:
          item.contentSnippet ||
          item.summary ||
          stripHtml(item.content || item["content:encoded"] || ""),
        thumbnail,
        author: item.creator || item.author || feedInfo.name,
        source: feedInfo.name,
      };
    });
    return { source: feedInfo.name, url: feedInfo.url, items, error: null };
  } catch (err) {
    console.error(`Failed to fetch ${feedInfo.name}:`, err.message);
    return {
      source: feedInfo.name,
      url: feedInfo.url,
      items: [],
      error: err.message,
    };
  }
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const channel = req.query.channel || "all";

  let feedsToFetch = [];
  if (channel === "all") {
    feedsToFetch = Object.values(FEEDS).flat();
  } else if (FEEDS[channel]) {
    feedsToFetch = FEEDS[channel];
  } else {
    res.status(400).json({ error: "Unknown channel" });
    return;
  }

  try {
    const results = await Promise.allSettled(
      feedsToFetch.map((f) => fetchFeed(f))
    );
    const feeds = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    // Also return channel metadata
    const channels = Object.keys(FEEDS).map((key) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      sources: FEEDS[key].map((f) => f.name),
    }));

    res.status(200).json({ feeds, channels, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
 
