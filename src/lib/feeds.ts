// جلب وتحليل خلاصات RSS من المصادر المصرية + Google Trends مصر.
// المحلّل مكتوب يدوياً (بدون مكتبات خارجية) ويتعامل مع RSS 2.0 وAtom.
import type { NewStoryInput } from "./db";

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  sourceName: string;
}

interface FeedDef {
  name: string;
  url: string;
}

export const NEWS_FEEDS: FeedDef[] = [
  { name: "اليوم السابع", url: "https://www.youm7.com/rss/SectionRss?SectionID=65" },
  // ملحوظة: رابط /rss/feed عند المصري اليوم يعيد صفحة HTML حالياً؛
  // الرابط الفعّال للخلاصة هو /rss/rssfeeds (RSS 2.0 سليم).
  { name: "المصري اليوم", url: "https://www.almasryalyoum.com/rss/rssfeeds" },
  { name: "Egypt Independent", url: "https://www.egyptindependent.com/feed/" },
];

export const TRENDS_FEED: FeedDef = {
  name: "Google Trends مصر",
  url: "https://trends.google.com/trending/rss?geo=EG",
};

const FETCH_TIMEOUT_MS = 15000;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; EgyptLegalNewsAggregator/1.0; +https://github.com/AhmedZakaria14/egypt-legal-news-aggregator)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function tagValue(block: string, tag: string): string | null {
  // يلتقط أول وسم مطابق (مع تجاهل وسوم مزوّدة بسمات مثل <link href=...>)
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function atomLink(block: string): string | null {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
  return m ? decodeEntities(m[1]) : null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** يحلّل نص XML (RSS أو Atom) إلى عناصر موحّدة. */
export function parseFeed(xml: string, sourceName: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const title = stripTags(tagValue(block, "title") || "");
    let link = tagValue(block, "link");
    if (!link || !/^https?:\/\//i.test(link)) link = atomLink(block);
    if (!title || !link) continue;
    const description = stripTags(
      tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content") || ""
    ).slice(0, 1200);
    const publishedAt = parseDate(
      tagValue(block, "pubDate") || tagValue(block, "published") || tagValue(block, "updated") || tagValue(block, "dc:date")
    );
    items.push({ title, link, description, publishedAt, sourceName });
  }
  return items;
}

/** تطبيع نص للمقارنة وإزالة التكرار (عربي/إنجليزي). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeKeyFor(item: FeedItem): string {
  let linkKey = item.link.trim().toLowerCase();
  try {
    const u = new URL(linkKey);
    u.hash = "";
    // إزالة معلمات التتبع الشائعة
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"]) {
      u.searchParams.delete(p);
    }
    linkKey = u.toString().replace(/\/$/, "");
  } catch {
    /* يبقى الرابط كما هو */
  }
  return `${linkKey}|${normalizeText(item.title).slice(0, 120)}`;
}

export interface FetchResult {
  items: NewStoryInput[];
  trendsQueries: string[];
  perFeed: Record<string, number>;
  errors: Record<string, string>;
}

/** يجلب كل الخلاصات. لا يرمي أبداً — الأخطاء تُسجَّل لكل مصدر على حدة. */
export async function fetchAllFeeds(): Promise<FetchResult> {
  const perFeed: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const byKey = new Map<string, NewStoryInput>();
  let trendsQueries: string[] = [];

  const jobs = NEWS_FEEDS.map(async (feed) => {
    try {
      const xml = await fetchText(feed.url);
      const parsed = parseFeed(xml, feed.name);
      perFeed[feed.name] = parsed.length;
      for (const item of parsed) {
        const key = dedupeKeyFor(item);
        if (!byKey.has(key)) {
          byKey.set(key, {
            dedupeKey: key,
            title: item.title,
            link: item.link,
            description: item.description,
            sourceName: item.sourceName,
            publishedAt: item.publishedAt,
          });
        }
      }
    } catch (e) {
      perFeed[feed.name] = 0;
      errors[feed.name] = e instanceof Error ? e.message : String(e);
    }
  });

  const trendsJob = (async () => {
    try {
      const xml = await fetchText(TRENDS_FEED.url);
      const parsed = parseFeed(xml, TRENDS_FEED.name);
      perFeed[TRENDS_FEED.name] = parsed.length;
      trendsQueries = parsed.map((i) => i.title).filter(Boolean);
    } catch (e) {
      perFeed[TRENDS_FEED.name] = 0;
      errors[TRENDS_FEED.name] = e instanceof Error ? e.message : String(e);
    }
  })();

  await Promise.all([...jobs, trendsJob]);
  return { items: [...byKey.values()], trendsQueries, perFeed, errors };
}

/**
 * هل يطابق عنوان الخبر إحدى عبارات التريند؟
 * مطابقة مرنة: كل كلمات عبارة التريند (بطول ≥ 3) موجودة في العنوان المُطبَّع،
 * أو العبارة كاملة جزء من العنوان.
 */
export function matchesTrend(title: string, trendsQueries: string[]): boolean {
  const t = normalizeText(title);
  if (!t) return false;
  for (const q of trendsQueries) {
    const nq = normalizeText(q);
    if (!nq) continue;
    if (t.includes(nq)) return true;
    const words = nq.split(" ").filter((w) => w.length >= 3);
    if (words.length >= 2 && words.every((w) => t.includes(w))) return true;
  }
  return false;
}
