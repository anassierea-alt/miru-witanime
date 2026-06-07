// ==MiruExtension==
// @name         WitAnime
// @version      v0.0.1
// @author       YourName
// @lang         ar
// @license      MIT
// @nsfw         false
// @icon         https://witanime.pics/wp-content/uploads/2022/06/witanime-logo.png
// @package      witanime.pics
// @type         bangumi
// @webSite      https://witanime.pics
// @description  Arabic anime streaming source — latest episodes, search, details and watch.
// ==/MiruExtension==

/**
 * ============================================================
 *  WitAnime — Miru Extension
 *
 *  Miru SDK quick-reference (all methods are async):
 *
 *  this.request(path, options?)
 *    Proxied HTTP GET relative to @webSite.
 *    Pass a full URL via options.headers["Miru-Url"] for
 *    absolute requests (detail / watch pages).
 *
 *  this.querySelector(html, selector)   → { text, content, getAttributeText(attr) }
 *  this.querySelectorAll(html, selector) → Array<{ text, content, getAttributeText(attr) }>
 *  element.content  → inner HTML string of that element (await it)
 *  element.text     → text content (no await needed)
 *  element.getAttributeText(attr) → attribute value string (no await needed)
 *
 *  Return shapes required by Miru:
 *   latest / search  →  ListItem[]  { title, url, cover, update? }
 *   detail           →  Detail      { title, cover, desc?, metadata?, episodes? }
 *   watch            →  BangumiWatch { type: "hls"|"mp4", url, headers? }
 * ============================================================
 */

export default class extends Extension {

  // ─────────────────────────────────────────────────────────────
  //  LATEST  — homepage feed
  //  Scrapes both the "pinned/popular anime" grid and the
  //  "latest episodes" strip, merging them into one ListItem[].
  // ─────────────────────────────────────────────────────────────
  async latest(page) {
    // WitAnime uses standard WordPress pagination: /?page_number=N
    const path = page > 1 ? `/?page_number=${page}` : "/";
    const res  = await this.request(path);
    const items = [];

    // ── 1. Anime card grid  (.anime-card-container) ───────────
    const animeCards = await this.querySelectorAll(
      res,
      ".anime-card-container"
    );

    for (const card of animeCards) {
      const html = await card.content;

      // Title: prefer data-original-title tooltip, fall back to text
      const titleEl  = await this.querySelector(html, ".anime-card-title");
      const title    = titleEl.getAttributeText("data-original-title")
                    || titleEl.text
                    || "Unknown";

      // Poster image — try src first, then data-src (lazy-load)
      const imgEl    = await this.querySelector(html, ".anime-card-poster img");
      const cover    = imgEl.getAttributeText("src")
                    || imgEl.getAttributeText("data-src")
                    || "";

      // Page URL for detail()
      const url      = await this.getAttributeText(
        html,
        ".anime-card-poster a.overlay",
        "href"
      );

      // Update badge (status string: "يعرض الآن", "مكتمل", …)
      const statusEl = await this.querySelector(html, ".anime-card-status a");
      const update   = statusEl.text || "";

      if (url) {
        items.push({ title: title.trim(), url, cover, update: update.trim() });
      }
    }

    // ── 2. Latest episodes strip  (.episodes-card-container) ──
    // These link directly to an episode watch page; we strip the
    // episode segment so detail() receives the anime series URL.
    const epCards = await this.querySelectorAll(
      res,
      ".episodes-card-container"
    );

    for (const card of epCards) {
      const html = await card.content;

      // Parent anime title and link
      const parentLinkEl = await this.querySelector(
        html,
        ".ep-card-anime-title h3 a"
      );
      const title  = parentLinkEl.text || "";
      const url    = parentLinkEl.getAttributeText("href") || "";

      // Episode thumbnail
      const thumbEl = await this.querySelector(html, ".episodes-card img");
      const cover   = thumbEl.getAttributeText("src")
                   || thumbEl.getAttributeText("data-src")
                   || "";

      // Episode number/label as the update badge
      const epTitleEl = await this.querySelector(
        html,
        ".episodes-card-title h3 a"
      );
      const update = epTitleEl.text || "";

      if (url && !items.some(i => i.url === url)) {
        // Only add if this anime isn't already listed from the card grid
        items.push({ title: title.trim(), url, cover, update: update.trim() });
      }
    }

    return items;
  }

  // ─────────────────────────────────────────────────────────────
  //  SEARCH  — keyword query
  //  WitAnime uses ?search_param=KEYWORD for its search route.
  // ─────────────────────────────────────────────────────────────
  async search(kw, page) {
    const encodedKw = encodeURIComponent(kw);
    const pageSuffix = page > 1 ? `&page_number=${page}` : "";
    const res = await this.request(
      `/?search_param=${encodedKw}${pageSuffix}`
    );

    const items = [];
    const cards = await this.querySelectorAll(res, ".anime-card-container");

    for (const card of cards) {
      const html = await card.content;

      const titleEl = await this.querySelector(html, ".anime-card-title");
      const title   = titleEl.getAttributeText("data-original-title")
                   || titleEl.text
                   || "Unknown";

      const imgEl   = await this.querySelector(html, ".anime-card-poster img");
      const cover   = imgEl.getAttributeText("src")
                   || imgEl.getAttributeText("data-src")
                   || "";

      const url     = await this.getAttributeText(
        html,
        ".anime-card-poster a.overlay",
        "href"
      );

      const statusEl = await this.querySelector(html, ".anime-card-status a");
      const typeEl   = await this.querySelector(html, ".anime-card-type a");
      // Combine status + type as the update/badge string
      const update   = [statusEl.text, typeEl.text]
        .filter(Boolean)
        .join(" · ");

      if (url) {
        items.push({ title: title.trim(), url, cover, update: update.trim() });
      }
    }

    return items;
  }

  // ─────────────────────────────────────────────────────────────
  //  DETAIL  — anime series page
  //  Returns title, cover, synopsis, metadata, and full episode list.
  //  The `url` argument comes from latest() / search() results.
  // ─────────────────────────────────────────────────────────────
  async detail(url) {
    // Use Miru-Url header for absolute URLs (required by the SDK proxy)
    const res = await this.request("", {
      headers: { "Miru-Url": url },
    });

    // ── Title ───────────────────────────────────────────────
    // WitAnime wraps the anime title in .anime-card-title on detail pages;
    // common alternatives are h1.anime-page-title / h1.entry-title.
    // We try multiple selectors for robustness.
    let title = "";
    try {
      const h1El = await this.querySelector(res, ".anime-page-title");
      title = h1El.text;
    } catch (_) {}
    if (!title) {
      try {
        const h1El = await this.querySelector(res, "h1.entry-title");
        title = h1El.text;
      } catch (_) {}
    }
    if (!title) title = "Unknown";

    // ── Cover image ─────────────────────────────────────────
    let cover = "";
    try {
      const coverEl = await this.querySelector(
        res,
        ".anime-page-top .anime-poster img"
      );
      cover = coverEl.getAttributeText("src")
            || coverEl.getAttributeText("data-src")
            || "";
    } catch (_) {}

    // ── Synopsis ─────────────────────────────────────────────
    let desc = "";
    try {
      const descEl = await this.querySelector(res, ".anime-story p");
      desc = descEl.text;
    } catch (_) {}

    // ── Metadata (status, type, season, studio, …) ──────────
    // WitAnime detail pages list info rows in .anime-info-container li
    const metadata = {};
    try {
      const infoItems = await this.querySelectorAll(
        res,
        ".anime-info-container li"
      );
      for (const item of infoItems) {
        const html  = await item.content;
        // Each <li> typically: <span class="info-type">Key</span> Value
        const key   = await this.querySelector(html, "span.info-type");
        const rawLi = await this.querySelector(html, "li");
        const value = (rawLi.text || "").replace(key.text || "", "").trim();
        if (key.text && value) {
          metadata[key.text.replace(/:$/, "").trim()] = value;
        }
      }
    } catch (_) {}

    // ── Episode list ─────────────────────────────────────────
    // WitAnime renders episodes inside .EpisodesList ul > li
    const episodeUrls = [];
    try {
      const epItems = await this.querySelectorAll(
        res,
        ".EpisodesList ul li"
      );

      for (const item of epItems) {
        const html = await item.content;
        // Each episode <li> has an <a> with href and a title element
        const linkEl  = await this.querySelector(html, "a");
        const epUrl   = linkEl.getAttributeText("href") || "";
        const nameEl  = await this.querySelector(html, ".ep-card-title");
        const epName  = nameEl.text || linkEl.text || "";

        if (epUrl) {
          episodeUrls.push({ name: epName.trim(), url: epUrl });
        }
      }
    } catch (_) {}

    // Miru expects episodes in an array of "season" buckets.
    // WitAnime is single-season, so we use one bucket.
    return {
      title:    title.trim(),
      cover,
      desc:     desc.trim(),
      metadata,
      episodes: [
        {
          title: "قائمة الحلقات",   // "Episode List" in Arabic
          urls:  episodeUrls,        // [{name, url}, …] — Miru passes url to watch()
        },
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  WATCH  — episode watch page
  //  Extracts the playable video source from the episode page.
  //  WitAnime embeds video in an <iframe> or a <video> tag.
  //  We handle both patterns and return a BangumiWatch object.
  // ─────────────────────────────────────────────────────────────
  async watch(url) {
    const res = await this.request("", {
      headers: { "Miru-Url": url },
    });

    // ── Strategy 1: <video> tag with direct src ──────────────
    try {
      const videoEl  = await this.querySelector(res, "video source");
      const videoSrc = videoEl.getAttributeText("src") || "";
      if (videoSrc) {
        const type = videoSrc.includes(".m3u8") ? "hls" : "mp4";
        return { type, url: videoSrc };
      }
    } catch (_) {}

    // ── Strategy 2: <iframe> embed (most common on WitAnime) ──
    // The page typically has a server-selection dropdown; we target
    // the active/default server iframe.
    let iframeSrc = "";
    try {
      // Active server tab iframe (class varies; try common patterns)
      const iframeEl = await this.querySelector(
        res,
        ".watch-iframe iframe, #iframe-embed, iframe.iframe-player"
      );
      iframeSrc = iframeEl.getAttributeText("src")
               || iframeEl.getAttributeText("data-src")
               || "";
    } catch (_) {}

    // Fallback: first iframe on the page
    if (!iframeSrc) {
      try {
        const iframeEl = await this.querySelector(res, "iframe");
        iframeSrc = iframeEl.getAttributeText("src")
                 || iframeEl.getAttributeText("data-src")
                 || "";
      } catch (_) {}
    }

    if (!iframeSrc) {
      throw new Error("لم يتم العثور على مصدر الفيديو في هذه الحلقة.");
    }

    // ── Resolve the iframe page to extract the real stream URL ─
    const iframeRes = await this.request("", {
      headers: { "Miru-Url": iframeSrc },
    });

    // Pattern A: jwplayer / standard HLS file={ file:"…m3u8" }
    const hlsMatch = iframeRes.match(
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/
    );
    if (hlsMatch) {
      return {
        type: "hls",
        url:  hlsMatch[1],
        headers: { Referer: new URL(iframeSrc).origin },
      };
    }

    // Pattern B: mp4 source — file:"…mp4"
    const mp4Match = iframeRes.match(
      /file\s*:\s*["']([^"']+\.mp4[^"']*)['"]/
    );
    if (mp4Match) {
      return {
        type: "mp4",
        url:  mp4Match[1],
        headers: { Referer: new URL(iframeSrc).origin },
      };
    }

    // Pattern C: sources:[{file:"…"}] (VideoJS / Plyr)
    const sourcesMatch = iframeRes.match(
      /sources\s*:\s*\[\s*\{\s*(?:file|src)\s*:\s*["']([^"']+)['"]/
    );
    if (sourcesMatch) {
      const streamUrl = sourcesMatch[1];
      const type      = streamUrl.includes(".m3u8") ? "hls" : "mp4";
      return {
        type,
        url: streamUrl,
        headers: { Referer: new URL(iframeSrc).origin },
      };
    }

    // Pattern D: direct <source src="…"> inside the iframe page
    try {
      const srcEl  = await this.querySelector(iframeRes, "source");
      const srcUrl = srcEl.getAttributeText("src") || "";
      if (srcUrl) {
        const type = srcUrl.includes(".m3u8") ? "hls" : "mp4";
        return { type, url: srcUrl };
      }
    } catch (_) {}

    throw new Error(
      "تعذّر استخراج رابط البث. قد يكون الخادم محمياً بتشفير إضافي."
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  CHECK UPDATE  — optional; returns the latest episode label
  //  so Miru can show update badges in the library.
  // ─────────────────────────────────────────────────────────────
  async checkUpdate(url) {
    const res = await this.request("", {
      headers: { "Miru-Url": url },
    });
    try {
      // Grab the first (most-recent) episode name from the list
      const firstEp = await this.querySelector(
        res,
        ".EpisodesList ul li:first-child .ep-card-title"
      );
      return firstEp.text.trim();
    } catch (_) {
      return "";
    }
  }
}
