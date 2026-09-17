/*
 * Revenue analytics becomes real when completed financial flows
 * record a RevenueEvent.
 *
 * IMPORTANT:
 * Use the ACTUAL final fee charged by your controller/service.
 * Do not calculate a second independent fee here.
 */

import {
  recordRevenueEvent,
} from "../services/revenueLedgerService.js";

/* =========================================================
   COMPLETED TRANSFER EXAMPLE
========================================================= */

export const recordCompletedTransferRevenue =
  async ({
    userId,
    transactionId,
    feeMinor,
    transferAmountMinor,
  }: {
    userId:
      string;

    transactionId:
      string;

    feeMinor:
      number;

    transferAmountMinor:
      number;
  }) => {
    await recordRevenueEvent({
      userId,

      idempotencyKey:
        `transfer-fee:${transactionId}`,

      kind:
        "TRANSFER_FEE",

      feeMinor,

      volumeMinor:
        transferAmountMinor,

      sourceReference:
        transactionId,

      metadata: {
        source:
          "transfer",
      },
    });
  };

/* =========================================================
   COMPLETED WITHDRAWAL EXAMPLE
========================================================= */

export const recordCompletedWithdrawalRevenue =
  async ({
    userId,
    transactionId,
    feeMinor,
    withdrawalAmountMinor,
  }: {
    userId:
      string;

    transactionId:
      string;

    feeMinor:
      number;

    withdrawalAmountMinor:
      number;
  }) => {
    await recordRevenueEvent({
      userId,

      idempotencyKey:
        `withdrawal-fee:${transactionId}`,

      kind:
        "WITHDRAWAL_FEE",

      feeMinor,

      volumeMinor:
        withdrawalAmountMinor,

      sourceReference:
        transactionId,

      metadata: {
        source:
          "withdrawal",
      },
    });
  };

/* =========================================================
   LEAKAGE EXAMPLES
========================================================= */

export const recordGatewayFeeReversal =
  async ({
    transactionId,
    userId,
    lostFeeMinor,
  }: {
    transactionId:
      string;

    userId?:
      string;

    lostFeeMinor:
      number;
  }) => {
    await recordRevenueEvent({
      userId,

      idempotencyKey:
        `gateway-reversal:${transactionId}`,

      kind:
        "GATEWAY_REVERSAL",

      feeMinor:
        lostFeeMinor,

      sourceReference:
        transactionId,
    });
  };

export const recordManualFeeWaiver =
  async ({
    referenceId,
    userId,
    waivedFeeMinor,
  }: {
    referenceId:
      string;

    userId?:
      string;

    waivedFeeMinor:
      number;
  }) => {
    await recordRevenueEvent({
      userId,

      idempotencyKey:
        `fee-waiver:${referenceId}`,

      kind:
        "FEE_WAIVER",

      feeMinor:
        waivedFeeMinor,

      sourceReference:
        referenceId,
    });
  };
