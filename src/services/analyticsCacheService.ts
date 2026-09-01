import type {
  AnalyticsDashboardData,
  AnalyticsRange,
} from "../types/analytics.js";

interface CacheEntry {
  expiresAt:
    number;
  value:
    AnalyticsDashboardData;
}

const cache =
  new Map<
    AnalyticsRange,
    CacheEntry
  >();

const TTL_MS:
  Record<
    AnalyticsRange,
    number
  > = {
  Today:
    45 *
    1000,
  "7D":
    2 *
    60 *
    1000,
  "30D":
    5 *
    60 *
    1000,
  "90D":
    10 *
    60 *
    1000,
  "1Y":
    15 *
    60 *
    1000,
};

/*
 * This is best-effort process-local caching only.
 * On serverless/multi-instance deployments it is NOT a
 * correctness mechanism. MongoDB remains source-of-truth.
 */
export const getCachedAnalytics =
  (
    range:
      AnalyticsRange
  ):
    AnalyticsDashboardData |
    null => {
    const item =
      cache.get(
        range
      );

    if (
      !item
    ) {
      return null;
    }

    if (
      Date.now() >
      item.expiresAt
    ) {
      cache.delete(
        range
      );

      return null;
    }

    return item.value;
  };

export const setCachedAnalytics =
  (
    range:
      AnalyticsRange,
    value:
      AnalyticsDashboardData
  ): void => {
    cache.set(
      range,
      {
        value,
        expiresAt:
          Date.now() +
          TTL_MS[
            range
          ],
      }
    );
  };

export const clearAnalyticsCache =
  (
    range?:
      AnalyticsRange
  ): void => {
    if (
      range
    ) {
      cache.delete(
        range
      );

      return;
    }

    cache.clear();
  };
