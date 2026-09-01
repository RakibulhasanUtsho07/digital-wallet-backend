import type {
  AnalyticsDateWindow,
  AnalyticsRange,
} from "../types/analytics.js";

const DAY_MS =
  24 *
  60 *
  60 *
  1000;

export const ANALYTICS_RANGES:
  AnalyticsRange[] = [
  "Today",
  "7D",
  "30D",
  "90D",
  "1Y",
];

export const parseAnalyticsRange =
  (
    value:
      unknown
  ):
    AnalyticsRange => {
    if (
      typeof value ===
        "string" &&
      ANALYTICS_RANGES.includes(
        value as
          AnalyticsRange
      )
    ) {
      return value as
        AnalyticsRange;
    }

    return "7D";
  };

export const getAnalyticsDateWindow =
  (
    range:
      AnalyticsRange,
    now:
      Date =
      new Date()
  ):
    AnalyticsDateWindow => {
    let start:
      Date;

    if (
      range ===
      "Today"
    ) {
      start =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
    } else {
      const days =
        range ===
        "7D"
          ? 7
          : range ===
            "30D"
            ? 30
            : range ===
              "90D"
              ? 90
              : 365;

      start =
        new Date(
          now.getTime() -
            days *
              DAY_MS
        );
    }

    const end =
      new Date(
        now
      );

    const duration =
      Math.max(
        1,
        end.getTime() -
          start.getTime()
      );

    const previousEnd =
      new Date(
        start.getTime()
      );

    const previousStart =
      new Date(
        previousEnd.getTime() -
          duration
      );

    return {
      start,
      end,
      previousStart,
      previousEnd,
    };
  };

export const createAnalyticsBuckets =
  (
    range:
      AnalyticsRange,
    start:
      Date,
    end:
      Date,
    bucketCount =
      7
  ) => {
    const safeCount =
      Math.max(
        1,
        Math.min(
          12,
          Math.floor(
            bucketCount
          )
        )
      );

    const totalMs =
      Math.max(
        1,
        end.getTime() -
          start.getTime()
      );

    const size =
      totalMs /
      safeCount;

    return Array.from(
      {
        length:
          safeCount,
      },
      (
        _,
        index
      ) => {
        const bucketStart =
          new Date(
            start.getTime() +
              size *
                index
          );

        const bucketEnd =
          index ===
          safeCount -
            1
            ? new Date(
                end
              )
            : new Date(
                start.getTime() +
                  size *
                    (
                      index +
                      1
                    )
              );

        let label:
          string;

        if (
          range ===
          "Today"
        ) {
          label =
            bucketStart.toLocaleTimeString(
              "en-US",
              {
                hour:
                  "numeric",
                hour12:
                  true,
              }
            );
        } else if (
          range ===
          "7D"
        ) {
          label =
            bucketStart.toLocaleDateString(
              "en-US",
              {
                weekday:
                  "short",
              }
            );
        } else if (
          range ===
          "1Y"
        ) {
          label =
            bucketStart.toLocaleDateString(
              "en-US",
              {
                month:
                  "short",
                year:
                  "2-digit",
              }
            );
        } else {
          label =
            bucketStart.toLocaleDateString(
              "en-US",
              {
                month:
                  "short",
                day:
                  "numeric",
              }
            );
        }

        return {
          start:
            bucketStart,
          end:
            bucketEnd,
          label,
        };
      }
    );
  };
