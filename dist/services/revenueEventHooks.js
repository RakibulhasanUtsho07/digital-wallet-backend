"use strict";
/*
 * Revenue analytics becomes real when completed financial flows
 * record a RevenueEvent.
 *
 * IMPORTANT:
 * Use the ACTUAL final fee charged by your controller/service.
 * Do not calculate a second independent fee here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordManualFeeWaiver = exports.recordGatewayFeeReversal = exports.recordCompletedWithdrawalRevenue = exports.recordCompletedTransferRevenue = void 0;
const revenueLedgerService_js_1 = require("../services/revenueLedgerService.js");
/* =========================================================
   COMPLETED TRANSFER EXAMPLE
========================================================= */
const recordCompletedTransferRevenue = async ({ userId, transactionId, feeMinor, transferAmountMinor, }) => {
    await (0, revenueLedgerService_js_1.recordRevenueEvent)({
        userId,
        idempotencyKey: `transfer-fee:${transactionId}`,
        kind: "TRANSFER_FEE",
        feeMinor,
        volumeMinor: transferAmountMinor,
        sourceReference: transactionId,
        metadata: {
            source: "transfer",
        },
    });
};
exports.recordCompletedTransferRevenue = recordCompletedTransferRevenue;
/* =========================================================
   COMPLETED WITHDRAWAL EXAMPLE
========================================================= */
const recordCompletedWithdrawalRevenue = async ({ userId, transactionId, feeMinor, withdrawalAmountMinor, }) => {
    await (0, revenueLedgerService_js_1.recordRevenueEvent)({
        userId,
        idempotencyKey: `withdrawal-fee:${transactionId}`,
        kind: "WITHDRAWAL_FEE",
        feeMinor,
        volumeMinor: withdrawalAmountMinor,
        sourceReference: transactionId,
        metadata: {
            source: "withdrawal",
        },
    });
};
exports.recordCompletedWithdrawalRevenue = recordCompletedWithdrawalRevenue;
/* =========================================================
   LEAKAGE EXAMPLES
========================================================= */
const recordGatewayFeeReversal = async ({ transactionId, userId, lostFeeMinor, }) => {
    await (0, revenueLedgerService_js_1.recordRevenueEvent)({
        userId,
        idempotencyKey: `gateway-reversal:${transactionId}`,
        kind: "GATEWAY_REVERSAL",
        feeMinor: lostFeeMinor,
        sourceReference: transactionId,
    });
};
exports.recordGatewayFeeReversal = recordGatewayFeeReversal;
const recordManualFeeWaiver = async ({ referenceId, userId, waivedFeeMinor, }) => {
    await (0, revenueLedgerService_js_1.recordRevenueEvent)({
        userId,
        idempotencyKey: `fee-waiver:${referenceId}`,
        kind: "FEE_WAIVER",
        feeMinor: waivedFeeMinor,
        sourceReference: referenceId,
    });
};
exports.recordManualFeeWaiver = recordManualFeeWaiver;
