export type SupportCaseSlaState =
  | "healthy"
  | "at_risk"
  | "breached"
  | "responded";

export interface SupportCaseSlaForecast {
  state: SupportCaseSlaState;
  risk: "low" | "medium" | "high" | "breached";
  dueAt: string;
  responseTargetMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  consumedPercent: number;
  firstResponseAt: string | null;
  explanation: string;
}

export function calculateSlaDueAt(
  createdAt: Date,
  responseTargetMinutes: number,
): Date {
  return new Date(
    createdAt.getTime() +
      Math.max(1, responseTargetMinutes) * 60_000,
  );
}

export function forecastSupportCaseSla(input: {
  createdAt: Date;
  dueAt: Date;
  responseTargetMinutes: number;
  firstResponseAt?: Date | null;
  now?: Date;
}): SupportCaseSlaForecast {
  const now = input.now ?? new Date();
  const elapsedMinutes = Math.max(
    0,
    (now.getTime() - input.createdAt.getTime()) / 60_000,
  );
  const remainingMinutes =
    (input.dueAt.getTime() - now.getTime()) / 60_000;
  const consumedPercent = Math.max(
    0,
    input.responseTargetMinutes > 0
      ? (elapsedMinutes / input.responseTargetMinutes) * 100
      : 100,
  );

  const common = {
    dueAt: input.dueAt.toISOString(),
    responseTargetMinutes: input.responseTargetMinutes,
    elapsedMinutes: Math.round(elapsedMinutes),
    remainingMinutes: Math.round(remainingMinutes),
    consumedPercent: Math.round(consumedPercent),
    firstResponseAt: input.firstResponseAt?.toISOString() ?? null,
  };

  if (input.firstResponseAt) {
    return {
      ...common,
      state: "responded",
      risk: "low",
      explanation: "The first Support response has been recorded.",
    };
  }

  if (remainingMinutes <= 0) {
    return {
      ...common,
      state: "breached",
      risk: "breached",
      explanation:
        "The first-response SLA target passed without a recorded first response.",
    };
  }

  if (consumedPercent >= 75) {
    return {
      ...common,
      state: "at_risk",
      risk: "high",
      explanation:
        "At least 75% of the first-response window has been consumed.",
    };
  }

  if (consumedPercent >= 50) {
    return {
      ...common,
      state: "at_risk",
      risk: "medium",
      explanation:
        "At least half of the first-response window has been consumed.",
    };
  }

  return {
    ...common,
    state: "healthy",
    risk: "low",
    explanation: "The case remains inside the normal response window.",
  };
}
