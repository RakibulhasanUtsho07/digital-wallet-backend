import { z } from "zod";
import type {
  AnalystSettingsPayload,
  AnalystSettingsSection,
} from "./analystSettingsTypes.js";

const percentage = z.number().min(0).max(100);

const schemas = {
  general: z.object({
    defaultRange: z.enum(["24h", "7d", "30d", "90d"]),
    defaultMode: z.enum(["all", "test", "live"]),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code."),
    timezone: z.string().trim().min(2).max(80),
    autoRefreshSeconds: z.number().int().min(15).max(300),
  }).strict(),

  dataScope: z.object({
    provider: z.string().trim().toLowerCase().max(50)
      .regex(/^$|^[a-z0-9][a-z0-9_-]*$/, "Provider contains invalid characters."),
    riskSource: z.enum(["all", "wallet", "card", "paypal", "local_psp"]),
  }).strict(),

  providerMonitoring: z.object({
    warningSuccessRate: percentage,
    criticalSuccessRate: percentage,
    maxAverageCompletionSeconds: z.number().int().min(1).max(3600),
  }).strict().refine(
    value => value.criticalSuccessRate < value.warningSuccessRate,
    { message: "Critical success rate must be lower than warning success rate." }
  ),

  alerts: z.object({
    enabled: z.boolean(),
    critical: z.boolean(),
    high: z.boolean(),
    medium: z.boolean(),
    info: z.boolean(),
    positive: z.boolean(),
  }).strict(),

  risk: z.object({
    highRiskRateWarning: percentage,
    paymentFailureRateWarning: percentage,
    disputeExposureRateWarning: percentage,
  }).strict(),

  anomalies: z.object({
    enabled: z.boolean(),
    sensitivity: z.enum(["low", "medium", "high"]),
    baselineDays: z.number().int().min(1).max(180),
    minimumSampleSize: z.number().int().min(1).max(100000),
  }).strict(),

  reports: z.object({
    defaultFormat: z.enum(["executive", "payments", "risk", "revenue"]),
    defaultRange: z.enum(["24h", "7d", "30d", "90d"]),
    defaultMode: z.enum(["all", "test", "live"]),
  }).strict(),

  aiInsights: z.object({
    enabled: z.boolean(),
    minimumSeverity: z.enum(["critical", "high", "medium", "info", "positive"]),
    showRecommendedActions: z.boolean(),
  }).strict(),

  export: z.object({
    defaultFormat: z.literal("csv"),
    fileNamePrefix: z.string().trim().min(1).max(40)
      .regex(/^[a-zA-Z0-9_-]+$/, "Filename prefix may use letters, numbers, underscore and hyphen only."),
  }).strict(),

  appearance: z.object({
    density: z.enum(["comfortable", "compact"]),
    animations: z.boolean(),
    chartMotion: z.boolean(),
  }).strict(),
} as const;

export const ANALYST_SETTINGS_SECTIONS = [
  "general",
  "dataScope",
  "providerMonitoring",
  "alerts",
  "risk",
  "anomalies",
  "reports",
  "aiInsights",
  "export",
  "appearance",
] as const;

export function isAnalystSettingsSection(
  value: string
): value is AnalystSettingsSection {
  return (ANALYST_SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export type AnalystSettingsValidationResult =
  | { ok: true; value: AnalystSettingsPayload[AnalystSettingsSection] }
  | { ok: false; message: string; field?: string };

export function validateAnalystSettingsSection(
  section: AnalystSettingsSection,
  value: unknown
): AnalystSettingsValidationResult {
  const result = schemas[section].safeParse(value);

  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.map(String).join(".");

    return {
      ok: false,
      message: issue?.message || "Invalid Analyst Settings.",
      ...(field ? { field } : {}),
    };
  }

  return {
    ok: true,
    value: result.data as AnalystSettingsPayload[AnalystSettingsSection],
  };
}
