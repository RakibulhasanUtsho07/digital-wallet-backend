import mongoose from "mongoose";

import {
  AnalystSettings,
} from "../models/AnalystSettings.js";

import type {
  AnalystSettingsPayload,
  AnalystSettingsSection,
} from "./analystSettingsTypes.js";

export const ANALYST_SETTINGS_DEFAULTS: AnalystSettingsPayload = {
  general: {
    defaultRange: "30d",
    defaultMode: "all",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    autoRefreshSeconds: 30,
  },
  dataScope: {
    provider: "",
    riskSource: "all",
  },
  providerMonitoring: {
    warningSuccessRate: 95,
    criticalSuccessRate: 85,
    maxAverageCompletionSeconds: 30,
  },
  alerts: {
    enabled: true,
    critical: true,
    high: true,
    medium: true,
    info: true,
    positive: false,
  },
  risk: {
    highRiskRateWarning: 10,
    paymentFailureRateWarning: 8,
    disputeExposureRateWarning: 3,
  },
  anomalies: {
    enabled: true,
    sensitivity: "medium",
    baselineDays: 30,
    minimumSampleSize: 100,
  },
  reports: {
    defaultFormat: "executive",
    defaultRange: "30d",
    defaultMode: "all",
  },
  aiInsights: {
    enabled: true,
    minimumSeverity: "info",
    showRecommendedActions: true,
  },
  export: {
    defaultFormat: "csv",
    fileNamePrefix: "coffer-analyst",
  },
  appearance: {
    density: "comfortable",
    animations: true,
    chartMotion: true,
  },
};

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getOrCreateAnalystSettings(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("INVALID_ANALYST_USER");
  }

  const objectId = new mongoose.Types.ObjectId(userId);

  const existing = await AnalystSettings.findOne({ userId: objectId });
  if (existing) return existing;

  try {
    return await AnalystSettings.create({
      userId: objectId,
      updatedBy: objectId,
      ...ANALYST_SETTINGS_DEFAULTS,
      revision: 1,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      const winner = await AnalystSettings.findOne({ userId: objectId });
      if (winner) return winner;
    }

    throw error;
  }
}

export function analystSettingsToDTO(
  value: {
    general: AnalystSettingsPayload["general"];
    dataScope: AnalystSettingsPayload["dataScope"];
    providerMonitoring: AnalystSettingsPayload["providerMonitoring"];
    alerts: AnalystSettingsPayload["alerts"];
    risk: AnalystSettingsPayload["risk"];
    anomalies: AnalystSettingsPayload["anomalies"];
    reports: AnalystSettingsPayload["reports"];
    aiInsights: AnalystSettingsPayload["aiInsights"];
    export: AnalystSettingsPayload["export"];
    appearance: AnalystSettingsPayload["appearance"];
  }
): AnalystSettingsPayload {
  return {
    general: plain(value.general),
    dataScope: plain(value.dataScope),
    providerMonitoring: plain(value.providerMonitoring),
    alerts: plain(value.alerts),
    risk: plain(value.risk),
    anomalies: plain(value.anomalies),
    reports: plain(value.reports),
    aiInsights: plain(value.aiInsights),
    export: plain(value.export),
    appearance: plain(value.appearance),
  };
}

export async function updateAnalystSettingsSectionAtomically({
  userId,
  section,
  value,
  revision,
}: {
  userId: string;
  section: AnalystSettingsSection;
  value: AnalystSettingsPayload[AnalystSettingsSection];
  revision: number;
}) {
  const objectId = new mongoose.Types.ObjectId(userId);

  return AnalystSettings.findOneAndUpdate(
    {
      userId: objectId,
      revision,
    },
    {
      $set: {
        [section]: plain(value),
        updatedBy: objectId,
      },
      $inc: {
        revision: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );
}

export function getChangedAnalystSettingsFields(
  section: AnalystSettingsSection,
  before: unknown,
  after: unknown
): string[] {
  const result: string[] = [];

  const isObject = (
    value: unknown
  ): value is Record<string, unknown> =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);

  const walk = (
    left: unknown,
    right: unknown,
    path: string
  ) => {
    if (isObject(left) && isObject(right)) {
      const keys = new Set([
        ...Object.keys(left),
        ...Object.keys(right),
      ]);

      for (const key of keys) {
        walk(left[key], right[key], `${path}.${key}`);
      }

      return;
    }

    if (JSON.stringify(left) !== JSON.stringify(right)) {
      result.push(path);
    }
  };

  walk(before, after, section);

  return Array.from(new Set(result));
}
