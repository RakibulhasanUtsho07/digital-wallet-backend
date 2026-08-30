/* =========================================================
   REVENUE TYPES
========================================================= */

export type RevenueRange =
  | "24H"
  | "7D"
  | "30D"
  | "90D"
  | "6M"
  | "1Y";

/* =========================================================
   REVENUE EVENT TYPES
========================================================= */

export type RevenueEventKind =
  | "TRANSFER_FEE"
  | "WITHDRAWAL_FEE"
  | "DEPOSIT_FEE"
  | "SERVICE_FEE"
  | "MERCHANT_FEE"
  | "REFUND"
  | "FEE_WAIVER"
  | "GATEWAY_REVERSAL"
  | "MICRO_FEE_ADJUSTMENT";

/* =========================================================
   LEAKAGE RISK
========================================================= */

export type LeakageRiskLevel =
  | "High"
  | "Medium"
  | "Low";

/* =========================================================
   LEAKAGE INVESTIGATION STATUS
========================================================= */

export type RevenueInvestigationStatus =
  | "investigating"
  | "resolved";

/* =========================================================
   REVENUE EVENT INPUT
========================================================= */

export interface RevenueEventInput {
  userId?: string;

  /*
   * Used to stop duplicate revenue events.
   *
   * Example:
   * transfer-fee:TRANSACTION_ID
   */
  idempotencyKey: string;

  kind: RevenueEventKind;

  /*
   * All monetary values use integer minor units.
   *
   * Example:
   * ৳10.00 = 1000
   */
  feeMinor: number;

  /*
   * Transaction/payment volume.
   *
   * Example:
   * ৳500.00 = 50000
   */
  volumeMinor?: number;

  /*
   * Original transaction / transfer /
   * withdrawal reference.
   */
  sourceReference?: string;

  occurredAt?: Date;

  /*
   * Never put secrets or sensitive PII here.
   */
  metadata?: Record<
    string,
    string | number | boolean
  >;
}

/* =========================================================
   REVENUE FEE POLICY DTO
========================================================= */

export interface RevenueFeePolicyDTO {
  transferFeeMinor: number;

  withdrawalFeeMinor: number;

  monthlyTxnEstimate: number;

  transferShareBps: number;

  withdrawalShareBps: number;

  elasticityBpsPer200Minor: number;

  revision: number;

  updatedAt: string | null;
}

/* =========================================================
   REVENUE SIMULATION INPUT
========================================================= */

export interface RevenueSimulationInput {
  transferFeeMinor: number;

  withdrawalFeeMinor: number;

  monthlyTransactions: number;
}

/* =========================================================
   REVENUE SIMULATION RESULT
========================================================= */

export interface RevenueSimulationResult {
  projectedRevenueMinor: number;

  baselineRevenueMinor: number;

  differenceMinor: number;

  percentageChange: number;

  transferContributionMinor: number;

  withdrawalContributionMinor: number;

  transferTransactions: number;

  withdrawalTransactions: number;

  requestedMonthlyTransactions: number;

  assumptions: {
    transferShare: number;

    withdrawalShare: number;

    elasticityPercentPerTwoTakaIncrease:
      number;

    source:
      "policy";
  };
}

/* =========================================================
   REVENUE LEAKAGE SIGNAL
========================================================= */

export interface RevenueLeakageSignal {
  id: string;

  category: string;

  amountMinor: number;

  sourceEventCount: number;

  reason: string;

  riskLevel: LeakageRiskLevel;

  action: string;

  investigationStatus:
    | "none"
    | RevenueInvestigationStatus;
}

/* =========================================================
   REVENUE CONTRIBUTOR
========================================================= */

export interface RevenueContributor {
  id: string;

  userId: string;

  name: string;

  email: string;

  type:
    | "VIP"
    | "Business"
    | "Premium"
    | "Standard";

  volumeMinor: number;

  feesPaidMinor: number;

  transactionsCount: number;
}