// ==MiruExtension==
// @name WitAnime
// @version v0.0.2
// @author Anass
// @lang ar
// @license MIT
// @nsfw false
// @icon https://witanime.you/wp-content/uploads/2022/06/witanime-logo.png
// @package witanime.you
// @type bangumi
// @webSite https://witanime.you
// @description Arabic anime streaming source — latest episodes, search, details and watch.
// ==/MiruExtension==

export default class extends Extension {

  // ─────────────────────────────────────────────────────────────
  // LATEST — homepage feed
  // ─────────────────────────────────────────────────────────────
  async latest(page) {
    // WitAnime uses standard WordPress pagination: /page/N/
    const path = page > 1 ? `/page/${page}/` : "/";
    const res = await this.request(path);
    const items = [];

    // ── 1. Anime card grid (.anime-card-container) ───────────
    const animeCards = await this.querySelectorAll(res, ".anime-card-container");
    for (const card of animeCards) {
      const html = await card.content;
      
      const titleEl = await this.querySelector(html, ".anime-card-title");
      const title = titleEl.getAttributeText("data-original-title") || titleEl.text || "Unknown";
      
      const imgEl = await this.querySelector(html, ".anime-card-poster img");
      const cover = imgEl.getAttributeText("src") || imgEl.getAttributeText("data-src") || "";
      
      const url = await this.getAttributeText(html, ".anime-card-poster a.overlay", "href");
      
      const statusEl = await this.querySelector(html, ".anime-card-status a");
      const update = statusEl.text || "";

      if (url) {
        items.push({
          title: title.trim(),
          url,
          cover,
          update: update.trim()
        });
      }
    }

    // ── 2. Latest episodes strip (.episodes-card-container) ──
    const epCards = await this.querySelectorAll(res, ".episodes-card-container");
    for (const card of epCards) {
      const html = await card.content;
      
      const parentLinkEl = await this.querySelector(html, ".ep-card-anime-title h3 a");
      const title = parentLinkEl.text || "";
      const url = parentLinkEl.getAttributeText("href") || "";
      
      const thumbEl = await this.querySelector(html, ".episodes-card img");
      const cover = thumbEl.getAttributeText("src") || thumbEl.getAttributeText("data-src") || "";
      
      const epTitleEl = await this.querySelector(html, ".episodes-card-title h3 a");
      const update = epTitleEl.text || "";

      if (url && !items.some(i => i.url === url)) {
        items.push({
          title: title.trim(),
          url,
          cover,
          update: update.trim()
        });
      }
    }

    return items;
  }

  // ─────────────────────────────────────────────────────────────
  // SEARCH — keyword query
  // ─────────────────────────────────────────────────────────────
  async search(kw, page) {
    const encodedKw = encodeURIComponent(kw);
    // witanime search pagination typically: /page/2/?search_param=keyword
    const path = page > 1 ? `/page/${page}/?search_param=${encodedKw}` : `/?search_param=${encodedKw}`;
    
    const res = await this.request(path);
    const items = [];
    
    const cards = await this.querySelectorAll(res, ".anime-card-container");
    for (const card of cards) {
      const html = await card.content;
      
      const titleEl = await this.querySelector(html, ".anime-card-title");
      const title = titleEl.getAttributeText("data-original-title") || titleEl.text || "Unknown";
      
      const imgEl = await this.querySelector(html, ".anime-card-poster img");
      const cover = imgEl.getAttributeText("src") || imgEl.getAttributeText("data-src") || "";
      
      const url = await this.getAttributeText(html, ".anime-card-poster a.overlay", "href");
      
      let update = "";
      try {
        const statusEl = await this.querySelector(html, ".anime-card-status a");
        const typeEl = await this.querySelector(html, ".anime-card-type a");
        update = [statusEl.text, typeEl.text].filter(Boolean).join(" · ");
      } catch (e) {}

      if (url) {
        items.push({
          title: title.trim(),
          url,
          cover,
          update: update.trim()
        });
      }
    }
    return items;
  }

  // ─────────────────────────────────────────────────────────────
  // DETAIL — anime series page
  // ─────────────────────────────────────────────────────────────
  async detail(url) {
    const res = await this.request("", { headers: { "Miru-Url": url } });

    let title = "Unknown";
    try {
      const h1El = await this.querySelector(res, ".anime-page-title, h1.entry-title, .anime-card-title");
      title = h1El.text;
    } catch (_) {}

    let cover = "";
    try {
      const coverEl = await this.querySelector(res, ".anime-page-top .anime-poster img, .anime-poster img");
      cover = coverEl.getAttributeText("src") || coverEl.getAttributeText("data-src") || "";
    } catch (_) {}

    let desc = "";
    try {
      const descEl = await this.querySelector(res, ".anime-story p");
      desc = descEl.text;
    } catch (_) {}

    const metadata = {};
    try {
      const infoItems = await this.querySelectorAll(res, ".anime-info-container li");
      for (const item of infoItems) {
        const html = await item.content;
        const keyEl = await this.querySelector(html, "span.info-type");
        const liEl = await this.querySelector(html, "li");
        
        const key = keyEl.text || "";
        const value = (liEl.text || "").replace(key, "").trim();
        if (key && value) {
          metadata[key.replace(/:$/, "").trim()] = value;
        }
      }
    } catch (_) {}

    const episodeUrls = [];
    try {
      const epItems = await this.querySelectorAll(res, ".EpisodesList ul li");
      for (const item of epItems) {
        const html = await item.content;
        const linkEl = await this.querySelector(html, "a");
        const epUrl = linkEl.getAttributeText("href") || "";
        
        let epName = "";
        try {
          const nameEl = await this.querySelector(html, ".ep-card-title");
          epName = nameEl.text;
        } catch (_) {
          epName = linkEl.text;
        }

        if (epUrl) {
          episodeUrls.push({
            name: epName.trim(),
            url: epUrl
          });
        }
      }
    } catch (_) {}

    // Reverse episodes so episode 1 is usually first
    episodeUrls.reverse();

    return {
      title: title.trim(),
      cover,
      desc: desc.trim(),
      metadata,
      episodes: [
        {
          title: "قائمة الحلقات",
          urls: episodeUrls,
        },
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────
  // WATCH — episode watch page
  // ─────────────────────────────────────────────────────────────
  async watch(url) {
    const res = await this.request("", { headers: { "Miru-Url": url } });

    // ── Strategy 1: <video> tag ──────────────
    try {
      const videoEl = await this.querySelector(res, "video source");
      const videoSrc = videoEl.getAttributeText("src") || "";
      if (videoSrc) {
        return {
          type: videoSrc.includes(".m3u8") ? "hls" : "mp4",
          url: videoSrc
        };
      }
    } catch (_) {}

    // ── Strategy 2: <iframe> embed ──────────
    let iframeSrc = "";
    try {
      const iframeEl = await this.querySelector(res, ".watch-iframe iframe, #iframe-embed, iframe.iframe-player, iframe");
      iframeSrc = iframeEl.getAttributeText("src") || iframeEl.getAttributeText("data-src") || "";
    } catch (_) {}

    if (!iframeSrc) {
      throw new Error("لم يتم العثور على مصدر الفيديو في هذه الحلقة.");
    }

    const iframeRes = await this.request("", { headers: { "Miru-Url": iframeSrc } });

    const hlsMatch = iframeRes.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/);
    if (hlsMatch) {
      return { type: "hls", url: hlsMatch[1], headers: { Referer: new URL(iframeSrc).origin } };
    }

    const mp4Match = iframeRes.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)['"]/);
    if (mp4Match) {
      return { type: "mp4", url: mp4Match[1], headers: { Referer: new URL(iframeSrc).origin } };
    }

    const sourcesMatch = iframeRes.match(/sources\s*:\s*\[\s*\{\s*(?:file|src)\s*:\s*["']([^"']+)['"]/);
    if (sourcesMatch) {
      const streamUrl = sourcesMatch[1];
      return {
        type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
        url: streamUrl,
        headers: { Referer: new URL(iframeSrc).origin }
      };
    }

    try {
      const srcEl = await this.querySelector(iframeRes, "source");
      const srcUrl = srcEl.getAttributeText("src") || "";
      if (srcUrl) {
        return { type: srcUrl.includes(".m3u8") ? "hls" : "mp4", url: srcUrl };
      }
    } catch (_) {}

    throw new Error("تعذّر استخراج رابط البث. السيرفر ربما يكون محمي.");
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK UPDATE
  // ─────────────────────────────────────────────────────────────
  async checkUpdate(url) {
    try {
      const res = await this.request("", { headers: { "Miru-Url": url } });
      const firstEp = await this.querySelector(res, ".EpisodesList ul li:first-child .ep-card-title");
      return firstEp.text.trim();
    } catch (_) {
      return "";
    }
  }
}
