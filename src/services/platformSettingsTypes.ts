export type Currency =
  | "BDT"
  | "USD"
  | "EUR";

export type Severity =
  | "normal"
  | "warning"
  | "critical";

export interface AdminSettingsPayload {
  platform: {
    maintenanceMode: boolean;
    allowSignups: boolean;
    defaultCurrency: Currency;
  };

  risk: {
    dailyTransferLimit: number;
    reviewThreshold: number;
    requireKycForHighValue: boolean;
    velocityWindowMinutes: number;
    maxTransfersPerWindow: number;
  };

  security: {
    requireMfa: boolean;
    sessionTimeoutMins: number;
    maxLoginAttempts: number;
    requireReauthForSensitiveActions: boolean;
  };
}
