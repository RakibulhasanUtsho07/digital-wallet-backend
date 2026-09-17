import {
  RevenueEvent,
} from "../models/RevenueEvent.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   TYPES
========================================================= */

export type AnalystRevenueKind =
  | "all"
  | "TRANSFER_FEE"
  | "WITHDRAWAL_FEE"
  | "DEPOSIT_FEE"
  | "SERVICE_FEE"
  | "MERCHANT_FEE"
  | "REFUND"
  | "FEE_WAIVER"
  | "GATEWAY_REVERSAL"
  | "MICRO_FEE_ADJUSTMENT";

export interface AnalystRevenueInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "growth"
    | "leakage"
    | "mix"
    | "data_quality";

  title: string;
  description: string;
  evidence: string;
  recommendedReview: string;
}

export interface AnalystRevenueData {
  generatedAt: string;

  source:
    "mongodb_revenue_event_ledger";

  filters: {
    range:
      AnalystDateFilters["range"];

    mode:
      AnalystDateFilters["mode"];

    currency:
      string;

    kind:
      AnalystRevenueKind;

    bucket:
      AnalystDateFilters["bucket"];

    from:
      string;

    to:
      string;

    previousFrom:
      string;

    previousTo:
      string;
  };

  metrics: {
    grossRevenueMinor:
      AnalystMetric;

    leakageMinor:
      AnalystMetric;

    netRevenueMinor:
      AnalystMetric;

    eventCount:
      AnalystMetric;

    revenueEventCount:
      AnalystMetric;

    leakageEventCount:
      AnalystMetric;

    averageRevenuePerEventMinor:
      AnalystMetric;

    leakageRate:
      AnalystMetric;
  };

  quality: {
    classifiedEventCount:
      number;

    unclassifiedEventCount:
      number;

    metadataCoverage:
      number;
  };

  trend: Array<{
    bucket:
      string;

    grossRevenueMinor:
      number;

    leakageMinor:
      number;

    netRevenueMinor:
      number;

    revenueEventCount:
      number;

    leakageEventCount:
      number;
  }>;

  kinds: Array<{
    kind:
      string;

    eventCount:
      number;

    grossMinor:
      number;

    leakageMinor:
      number;

    netMinor:
      number;

    percentageOfNetRevenue:
      number;
  }>;

  sources: Array<{
    source:
      string;

    eventCount:
      number;

    netRevenueMinor:
      number;

    percentage:
      number;
  }>;

  leakage: Array<{
    kind:
      string;

    count:
      number;

    amountMinor:
      number;

    percentage:
      number;
  }>;

  insights:
    AnalystRevenueInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface RevenueRow {
  kind?: unknown;
  feeMinor?: unknown;
  occurredAt?: unknown;

  metadata?: {
    currency?: unknown;
    mode?: unknown;
    source?: unknown;
  };
}

interface RevenueSummary {
  grossRevenueMinor:
    number;

  leakageMinor:
    number;

  netRevenueMinor:
    number;

  eventCount:
    number;

  revenueEventCount:
    number;

  leakageEventCount:
    number;

  classifiedEventCount:
    number;

  unclassifiedEventCount:
    number;
}

/* =========================================================
   EVENT CLASSIFICATION
========================================================= */

const REVENUE_KINDS =
  new Set([
    "TRANSFER_FEE",
    "WITHDRAWAL_FEE",
    "DEPOSIT_FEE",
    "SERVICE_FEE",
    "MERCHANT_FEE",
  ]);

const LEAKAGE_KINDS =
  new Set([
    "REFUND",
    "FEE_WAIVER",
    "GATEWAY_REVERSAL",
    "MICRO_FEE_ADJUSTMENT",
  ]);

/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(
  input:
    unknown
): number {
  const value =
    Number(input);

  return Number.isFinite(
    value
  )
    ? value
    : 0;
}

function safeInteger(
  input:
    unknown
): number {
  return Math.max(
    0,
    Math.round(
      safeNumber(
        input
      )
    )
  );
}

function round(
  value:
    number
): number {
  return Number(
    value.toFixed(
      2
    )
  );
}

function percentage(
  part:
    number,
  total:
    number
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return round(
    (
      part /
      total
    ) *
      100
  );
}

function changePercent(
  current:
    number,
  previous:
    number
): number | null {
  if (
    previous ===
    0
  ) {
    return current ===
      0
      ? 0
      : null;
  }

  return round(
    (
      (
        current -
        previous
      ) /
      Math.abs(
        previous
      )
    ) *
      100
  );
}

function metric(
  current:
    number,
  previous:
    number
): AnalystMetric {
  return {
    value:
      round(
        current
      ),

    previousValue:
      round(
        previous
      ),

    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   STRING HELPERS
========================================================= */

function stringValue(
  input:
    unknown
): string {
  return typeof input ===
    "string"
    ? input.trim()
    : "";
}

function eventCurrency(
  row:
    RevenueRow
): string {
  return stringValue(
    row.metadata
      ?.currency
  ).toUpperCase();
}

function eventMode(
  row:
    RevenueRow
): string {
  return stringValue(
    row.metadata
      ?.mode
  ).toLowerCase();
}

function eventSource(
  row:
    RevenueRow
): string {
  return (
    stringValue(
      row.metadata
        ?.source
    ).toLowerCase() ||
    "unclassified"
  );
}

/* =========================================================
   FILTER
========================================================= */

function eventMatchesDimensions(
  row:
    RevenueRow,
  filters:
    AnalystDateFilters
): boolean {
  const currency =
    eventCurrency(
      row
    );

  const mode =
    eventMode(
      row
    );

  if (
    currency !==
    filters.currency
  ) {
    return false;
  }

  if (
    filters.mode !==
      "all" &&
    mode !==
      filters.mode
  ) {
    return false;
  }

  return true;
}

function eventHasRequiredDimensions(
  row:
    RevenueRow,
  filters:
    AnalystDateFilters
): boolean {
  const currency =
    eventCurrency(
      row
    );

  const mode =
    eventMode(
      row
    );

  if (!currency) {
    return false;
  }

  if (
    filters.mode !==
      "all" &&
    !mode
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   LOAD
========================================================= */

async function loadEvents(
  from:
    Date,
  to:
    Date,
  kind:
    AnalystRevenueKind
): Promise<
  RevenueRow[]
> {
  const query:
    Record<
      string,
      unknown
    > = {
      occurredAt: {
        $gte:
          from,

        $lt:
          to,
      },
    };

  if (
    kind !==
    "all"
  ) {
    query.kind =
      kind;
  }

  const rows =
    await RevenueEvent.find(
      query
    )
      .select(
        "kind feeMinor occurredAt metadata"
      )
      .lean();

  return rows as
    unknown as
    RevenueRow[];
}

/* =========================================================
   SUMMARY
========================================================= */

function summarize(
  rows:
    RevenueRow[],
  filters:
    AnalystDateFilters
): RevenueSummary {
  let grossRevenueMinor =
    0;

  let leakageMinor =
    0;

  let eventCount =
    0;

  let revenueEventCount =
    0;

  let leakageEventCount =
    0;

  let classifiedEventCount =
    0;

  let unclassifiedEventCount =
    0;

  for (
    const row of
    rows
  ) {
    if (
      !eventHasRequiredDimensions(
        row,
        filters
      )
    ) {
      unclassifiedEventCount +=
        1;

      continue;
    }

    if (
      !eventMatchesDimensions(
        row,
        filters
      )
    ) {
      continue;
    }

    classifiedEventCount +=
      1;

    eventCount +=
      1;

    const kind =
      stringValue(
        row.kind
      ).toUpperCase();

    const feeMinor =
      safeInteger(
        row.feeMinor
      );

    if (
      REVENUE_KINDS.has(
        kind
      )
    ) {
      grossRevenueMinor +=
        feeMinor;

      revenueEventCount +=
        1;
    }

    if (
      LEAKAGE_KINDS.has(
        kind
      )
    ) {
      leakageMinor +=
        feeMinor;

      leakageEventCount +=
        1;
    }
  }

  return {
    grossRevenueMinor,

    leakageMinor,

    netRevenueMinor:
      grossRevenueMinor -
      leakageMinor,

    eventCount,

    revenueEventCount,

    leakageEventCount,

    classifiedEventCount,

    unclassifiedEventCount,
  };
}

/* =========================================================
   BUCKET KEY
========================================================= */

function bucketKey(
  date:
    Date,
  bucket:
    AnalystDateFilters[
      "bucket"
    ]
): string {
  if (
    bucket ===
    "hour"
  ) {
    return `${date
      .toISOString()
      .slice(
        0,
        13
      )}:00:00Z`;
  }

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

/* =========================================================
   TREND
========================================================= */

function buildTrend(
  rows:
    RevenueRow[],
  filters:
    AnalystDateFilters
): AnalystRevenueData[
  "trend"
] {
  const map =
    new Map<
      string,
      AnalystRevenueData[
        "trend"
      ][number]
    >();

  const cursor =
    new Date(
      filters.from
    );

  if (
    filters.bucket ===
    "hour"
  ) {
    cursor.setUTCMinutes(
      0,
      0,
      0
    );
  } else {
    cursor.setUTCHours(
      0,
      0,
      0,
      0
    );
  }

  while (
    cursor <=
    filters.to
  ) {
    const key =
      bucketKey(
        cursor,
        filters.bucket
      );

    map.set(
      key,
      {
        bucket:
          key,

        grossRevenueMinor:
          0,

        leakageMinor:
          0,

        netRevenueMinor:
          0,

        revenueEventCount:
          0,

        leakageEventCount:
          0,
      }
    );

    if (
      filters.bucket ===
      "hour"
    ) {
      cursor.setUTCHours(
        cursor.getUTCHours() +
          1
      );
    } else {
      cursor.setUTCDate(
        cursor.getUTCDate() +
          1
      );
    }
  }

  for (
    const row of
    rows
  ) {
    if (
      !eventMatchesDimensions(
        row,
        filters
      )
    ) {
      continue;
    }

    const rawDate =
      row.occurredAt;

    const date =
      rawDate instanceof
      Date
        ? rawDate
        : new Date(
            String(
              rawDate ??
                ""
            )
          );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      continue;
    }

    const key =
      bucketKey(
        date,
        filters.bucket
      );

    const point =
      map.get(
        key
      );

    if (!point) {
      continue;
    }

    const kind =
      stringValue(
        row.kind
      ).toUpperCase();

    const feeMinor =
      safeInteger(
        row.feeMinor
      );

    if (
      REVENUE_KINDS.has(
        kind
      )
    ) {
      point.grossRevenueMinor +=
        feeMinor;

      point.revenueEventCount +=
        1;
    }

    if (
      LEAKAGE_KINDS.has(
        kind
      )
    ) {
      point.leakageMinor +=
        feeMinor;

      point.leakageEventCount +=
        1;
    }

    point.netRevenueMinor =
      point.grossRevenueMinor -
      point.leakageMinor;
  }

  return Array.from(
    map.values()
  );
}

/* =========================================================
   KIND BREAKDOWN
========================================================= */

function buildKindBreakdown(
  rows:
    RevenueRow[],
  filters:
    AnalystDateFilters,
  totalNet:
    number
): AnalystRevenueData[
  "kinds"
] {
  const map =
    new Map<
      string,
      {
        eventCount:
          number;

        grossMinor:
          number;

        leakageMinor:
          number;
      }
    >();

  for (
    const row of
    rows
  ) {
    if (
      !eventMatchesDimensions(
        row,
        filters
      )
    ) {
      continue;
    }

    const kind =
      stringValue(
        row.kind
      ).toUpperCase() ||
      "UNKNOWN";

    const current =
      map.get(
        kind
      ) ?? {
        eventCount:
          0,

        grossMinor:
          0,

        leakageMinor:
          0,
      };

    const feeMinor =
      safeInteger(
        row.feeMinor
      );

    current.eventCount +=
      1;

    if (
      REVENUE_KINDS.has(
        kind
      )
    ) {
      current.grossMinor +=
        feeMinor;
    }

    if (
      LEAKAGE_KINDS.has(
        kind
      )
    ) {
      current.leakageMinor +=
        feeMinor;
    }

    map.set(
      kind,
      current
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      ([
        kind,
        value,
      ]) => {
        const netMinor =
          value.grossMinor -
          value.leakageMinor;

        return {
          kind,

          eventCount:
            value.eventCount,

          grossMinor:
            value.grossMinor,

          leakageMinor:
            value.leakageMinor,

          netMinor,

          percentageOfNetRevenue:
            totalNet >
            0
              ? percentage(
                  Math.max(
                    0,
                    netMinor
                  ),
                  totalNet
                )
              : 0,
        };
      }
    )
    .sort(
      (
        first,
        second
      ) =>
        Math.abs(
          second.netMinor
        ) -
        Math.abs(
          first.netMinor
        )
    );
}

/* =========================================================
   SOURCE BREAKDOWN
========================================================= */

function buildSourceBreakdown(
  rows:
    RevenueRow[],
  filters:
    AnalystDateFilters,
  totalNet:
    number
): AnalystRevenueData[
  "sources"
] {
  const map =
    new Map<
      string,
      {
        eventCount:
          number;

        netRevenueMinor:
          number;
      }
    >();

  for (
    const row of
    rows
  ) {
    if (
      !eventMatchesDimensions(
        row,
        filters
      )
    ) {
      continue;
    }

    const source =
      eventSource(
        row
      );

    const kind =
      stringValue(
        row.kind
      ).toUpperCase();

    const fee =
      safeInteger(
        row.feeMinor
      );

    const current =
      map.get(
        source
      ) ?? {
        eventCount:
          0,

        netRevenueMinor:
          0,
      };

    current.eventCount +=
      1;

    if (
      REVENUE_KINDS.has(
        kind
      )
    ) {
      current.netRevenueMinor +=
        fee;
    }

    if (
      LEAKAGE_KINDS.has(
        kind
      )
    ) {
      current.netRevenueMinor -=
        fee;
    }

    map.set(
      source,
      current
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      ([
        source,
        value,
      ]) => ({
        source,

        eventCount:
          value.eventCount,

        netRevenueMinor:
          value.netRevenueMinor,

        percentage:
          totalNet >
          0
            ? percentage(
                Math.max(
                  0,
                  value.netRevenueMinor
                ),
                totalNet
              )
            : 0,
      })
    )
    .sort(
      (
        first,
        second
      ) =>
        second.netRevenueMinor -
        first.netRevenueMinor
    );
}

/* =========================================================
   LEAKAGE BREAKDOWN
========================================================= */

function buildLeakage(
  rows:
    RevenueRow[],
  filters:
    AnalystDateFilters,
  totalLeakage:
    number
): AnalystRevenueData[
  "leakage"
] {
  const map =
    new Map<
      string,
      {
        count:
          number;

        amountMinor:
          number;
      }
    >();

  for (
    const row of
    rows
  ) {
    if (
      !eventMatchesDimensions(
        row,
        filters
      )
    ) {
      continue;
    }

    const kind =
      stringValue(
        row.kind
      ).toUpperCase();

    if (
      !LEAKAGE_KINDS.has(
        kind
      )
    ) {
      continue;
    }

    const current =
      map.get(
        kind
      ) ?? {
        count:
          0,

        amountMinor:
          0,
      };

    current.count +=
      1;

    current.amountMinor +=
      safeInteger(
        row.feeMinor
      );

    map.set(
      kind,
      current
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      ([
        kind,
        value,
      ]) => ({
        kind,

        count:
          value.count,

        amountMinor:
          value.amountMinor,

        percentage:
          percentage(
            value.amountMinor,
            totalLeakage
          ),
      })
    )
    .sort(
      (
        first,
        second
      ) =>
        second.amountMinor -
        first.amountMinor
    );
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildInsights(
  input: {
    current:
      RevenueSummary;

    previous:
      RevenueSummary;

    kinds:
      AnalystRevenueData[
        "kinds"
      ];

    metadataCoverage:
      number;
  }
): AnalystRevenueInsight[] {
  const insights:
    AnalystRevenueInsight[] =
    [];

  const revenueChange =
    changePercent(
      input.current
        .netRevenueMinor,
      input.previous
        .netRevenueMinor
    );

  const leakageRate =
    percentage(
      input.current
        .leakageMinor,
      input.current
        .grossRevenueMinor
    );

  if (
    revenueChange !==
      null &&
    revenueChange <=
      -20
  ) {
    insights.push({
      id:
        "revenue-decline",

      severity:
        revenueChange <=
        -40
          ? "high"
          : "medium",

      category:
        "growth",

      title:
        "Net platform revenue declined",

      description:
        "Classified net fee revenue is materially below the preceding equivalent period.",

      evidence:
        `Revenue changed by ${revenueChange.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Compare revenue kind, source and leakage distributions before escalating the decline.",
    });
  }

  if (
    revenueChange !==
      null &&
    revenueChange >=
      20
  ) {
    insights.push({
      id:
        "revenue-growth",

      severity:
        "positive",

      category:
        "growth",

      title:
        "Net revenue is growing",

      description:
        "Classified platform fee revenue increased against the preceding equivalent period.",

      evidence:
        `Revenue increased by ${revenueChange.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Check whether growth is diversified across fee kinds and operational sources.",
    });
  }

  if (
    leakageRate >=
      10 &&
    input.current
        .grossRevenueMinor >
      0
  ) {
    insights.push({
      id:
        "revenue-leakage-high",

      severity:
        leakageRate >=
        20
          ? "high"
          : "medium",

      category:
        "leakage",

      title:
        "Revenue leakage is elevated",

      description:
        "Refunds, waivers, reversals and micro-fee adjustments are reducing captured fee revenue.",

      evidence:
        `Leakage represents ${leakageRate.toFixed(
          2
        )}% of gross classified revenue.`,

      recommendedReview:
        "Review leakage categories and identify whether reversals, waivers, refunds, or adjustments dominate the loss.",
    });
  }

  const dominant =
    input.kinds.find(
      (
        item
      ) =>
        item.percentageOfNetRevenue >=
        70
    );

  if (
    dominant
  ) {
    insights.push({
      id:
        "revenue-concentration",

      severity:
        "info",

      category:
        "mix",

      title:
        "Revenue is concentrated in one fee category",

      description:
        "A single event kind contributes most of current positive net revenue.",

      evidence:
        `${dominant.kind} contributes ${dominant.percentageOfNetRevenue.toFixed(
          2
        )}% of positive net revenue.`,

      recommendedReview:
        "Monitor concentration so revenue performance is not interpreted as broad-based growth.",
    });
  }

  if (
    input.metadataCoverage <
    100
  ) {
    insights.push({
      id:
        "revenue-metadata-coverage",

      severity:
        input.metadataCoverage <
        80
          ? "medium"
          : "info",

      category:
        "data_quality",

      title:
        "Revenue metadata coverage is incomplete",

      description:
        "Some RevenueEvent records cannot be reliably classified for the selected currency or mode.",

      evidence:
        `${input.metadataCoverage.toFixed(
          2
        )}% of events have the reporting dimensions required by this view.`,

      recommendedReview:
        "Ensure revenue event hooks consistently record metadata.currency and metadata.mode.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "revenue-stable",

      severity:
        "positive",

      category:
        "growth",

      title:
        "Revenue signals are stable",

      description:
        "No major deterministic growth, leakage, concentration, or data-quality threshold was triggered.",

      evidence:
        `${input.current.eventCount} classified events were evaluated.`,

      recommendedReview:
        "Continue monitoring the revenue trend and leakage mix.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystRevenueAnalytics(
  input: {
    filters:
      AnalystDateFilters;

    kind:
      AnalystRevenueKind;
  }
): Promise<AnalystRevenueData> {
  const {
    filters,
    kind,
  } = input;

  const [
    currentRows,
    previousRows,
  ] =
    await Promise.all([
      loadEvents(
        filters.from,
        filters.to,
        kind
      ),

      loadEvents(
        filters.previousFrom,
        filters.previousTo,
        kind
      ),
    ]);

  const current =
    summarize(
      currentRows,
      filters
    );

  const previousFilters:
    AnalystDateFilters = {
    ...filters,

    from:
      filters.previousFrom,

    to:
      filters.previousTo,

    previousFrom:
      filters.previousFrom,

    previousTo:
      filters.previousTo,
  };

  const previous =
    summarize(
      previousRows,
      previousFilters
    );

  const kinds =
    buildKindBreakdown(
      currentRows,
      filters,
      Math.max(
        0,
        current.netRevenueMinor
      )
    );

  const sources =
    buildSourceBreakdown(
      currentRows,
      filters,
      Math.max(
        0,
        current.netRevenueMinor
      )
    );

  const leakage =
    buildLeakage(
      currentRows,
      filters,
      current.leakageMinor
    );

  const totalRawEvents =
    current.classifiedEventCount +
    current.unclassifiedEventCount;

  const metadataCoverage =
    percentage(
      current.classifiedEventCount,
      totalRawEvents
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "mongodb_revenue_event_ledger",

    filters: {
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      kind,

      bucket:
        filters.bucket,

      from:
        filters.from
          .toISOString(),

      to:
        filters.to
          .toISOString(),

      previousFrom:
        filters.previousFrom
          .toISOString(),

      previousTo:
        filters.previousTo
          .toISOString(),
    },

    metrics: {
      grossRevenueMinor:
        metric(
          current.grossRevenueMinor,
          previous.grossRevenueMinor
        ),

      leakageMinor:
        metric(
          current.leakageMinor,
          previous.leakageMinor
        ),

      netRevenueMinor:
        metric(
          current.netRevenueMinor,
          previous.netRevenueMinor
        ),

      eventCount:
        metric(
          current.eventCount,
          previous.eventCount
        ),

      revenueEventCount:
        metric(
          current.revenueEventCount,
          previous.revenueEventCount
        ),

      leakageEventCount:
        metric(
          current.leakageEventCount,
          previous.leakageEventCount
        ),

      averageRevenuePerEventMinor:
        metric(
          current.revenueEventCount >
          0
            ? current.grossRevenueMinor /
                current.revenueEventCount
            : 0,

          previous.revenueEventCount >
          0
            ? previous.grossRevenueMinor /
                previous.revenueEventCount
            : 0
        ),

      leakageRate:
        metric(
          percentage(
            current.leakageMinor,
            current.grossRevenueMinor
          ),

          percentage(
            previous.leakageMinor,
            previous.grossRevenueMinor
          )
        ),
    },

    quality: {
      classifiedEventCount:
        current.classifiedEventCount,

      unclassifiedEventCount:
        current.unclassifiedEventCount,

      metadataCoverage,
    },

    trend:
      buildTrend(
        currentRows,
        filters
      ),

    kinds,

    sources,

    leakage,

    insights:
      buildInsights({
        current,
        previous,
        kinds,
        metadataCoverage,
      }),
  };
}