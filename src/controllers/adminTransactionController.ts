import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";
import { getAdminTransactionLedger } from "../services/adminTransactionLedgerService.js";



/* =========================================================
   ALL PLATFORM TRANSACTIONS
   GET /api/admin/transactions
========================================================= */

export async function getAllAdminTransactions(
  _req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result =
      await getAdminTransactionLedger();

    res.status(200).json({
      success:
        true,
      count:
        result.transactions.length,
      transactions:
        result.transactions,
      meta: {
        integrityWarnings:
          result.integrityWarnings,
        sourceCounts:
          result.sourceCounts,
      },
    });
  } catch (error: unknown) {
    console.error(
      "GET ADMIN TRANSACTION LEDGER ERROR:",
      error
    );

    res.status(500).json({
      success:
        false,
      message:
        "Unable to load the platform transaction ledger.",
    });
  }
}
