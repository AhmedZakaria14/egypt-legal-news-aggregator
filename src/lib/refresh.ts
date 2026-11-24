// تنسيق عملية التحديث: جلب الخلاصات ← إدخال الجديد ← تقييمه ← تحديث وقت آخر تحديث.
import {
  applyScore,
  countStories,
  insertStoryIfNew,
  listUnscoredStories,
  setLastRefreshAt,
} from "./db";
import { fetchAllFeeds } from "./feeds";
import { scoreBatch } from "./scoring";

export interface RefreshResult {
  fetchedTotal: number;
  newStories: number;
  scoredCount: number;
  scoringMethod: "claude" | "keywords";
  perFeed: Record<string, number>;
  errors: Record<string, string>;
  totalStories: number;
  refreshedAt: string;
}

// قفل بسيط لمنع تحديثين متزامنين على نفس العملية
let inFlight: Promise<RefreshResult> | null = null;

export function refreshNews(): Promise<RefreshResult> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doRefresh(): Promise<RefreshResult> {
  const { items, trendsQueries, perFeed, errors } = await fetchAllFeeds();

  let newStories = 0;
  for (const item of items) {
    if (insertStoryIfNew(item)) newStories++;
  }

  const unscored = listUnscoredStories(60);
  const { updates, method } = await scoreBatch(unscored, trendsQueries);
  for (const u of updates) applyScore(u);

  const refreshedAt = new Date().toISOString();
  setLastRefreshAt(refreshedAt);

  return {
    fetchedTotal: items.length,
    newStories,
    scoredCount: updates.length,
    scoringMethod: method,
    perFeed,
    errors,
    totalStories: countStories(),
    refreshedAt,
  };
}
