import mongoose from "mongoose";
import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  CashFlowPlan,
} from "../models/CashFlowPlan.js";

import {
  decryptData,
  encryptData,
} from "../utils/crypto.js";

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

function setPrivateNoStore(
  res: Response
) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );
}

function normalizeText(
  value: unknown,
  maxLength: number
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
}

function normalizeType(
  value: unknown
):
  | "INCOME"
  | "EXPENSE"
  | null {
  if (
    value === "income" ||
    value === "INCOME"
  ) {
    return "INCOME";
  }

  if (
    value === "expense" ||
    value === "EXPENSE"
  ) {
    return "EXPENSE";
  }

  return null;
}

function normalizeAmount(
  value: unknown
) {
  const amount =
    Number(
      value
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    return null;
  }

  const normalized =
    Math.round(
      amount * 100
    ) / 100;

  if (
    Math.abs(
      amount -
      normalized
    ) >
    Number.EPSILON
  ) {
    return null;
  }

  return normalized;
}

function startOfToday() {
  const now =
    new Date();

  now.setHours(
    0,
    0,
    0,
    0
  );

  return now;
}

function decryptValue(
  value: unknown
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new Error(
      "Invalid encrypted cash-flow value."
    );
  }

  const data =
    value as Partial<EncryptedValue>;

  if (
    typeof data.encrypted !==
      "string" ||
    typeof data.iv !==
      "string" ||
    typeof data.authTag !==
      "string"
  ) {
    throw new Error(
      "Invalid encrypted cash-flow value."
    );
  }

  return decryptData({
    encrypted:
      data.encrypted,

    iv:
      data.iv,

    authTag:
      data.authTag,
  });
}

function planDTO(
  plan: any
) {
  const decryptedMinorUnits =
    Number(
      decryptValue(
        plan.amountEncrypted
      )
    );

  if (
    !Number.isSafeInteger(
      decryptedMinorUnits
    ) ||
    decryptedMinorUnits <=
      0
  ) {
    throw new Error(
      "Invalid encrypted cash-flow amount."
    );
  }

  return {
    id:
      String(
        plan._id
      ),

    title:
      decryptValue(
        plan.titleEncrypted
      ),

    amount:
      decryptedMinorUnits /
      100,

    type:
      plan.type ===
      "INCOME"
        ? "income"
        : "expense",

    category:
      decryptValue(
        plan.categoryEncrypted
      ),

    date:
      new Date(
        plan.date
      ).toISOString(),

    isRecurring:
      Boolean(
        plan.isRecurring
      ),

    status:
      "pending" as const,
  };
}

/* =========================================================
   GET UPCOMING PLANS
   GET /api/cash-flow/plans
========================================================= */

export const getCashFlowPlans =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success:
            false,
          message:
            "Not authorized",
        });

        return;
      }

      const plans =
        await CashFlowPlan.find(
          {
            userId,

            date: {
              $gte:
                startOfToday(),
            },
          }
        )
          .sort({
            date: 1,
            createdAt: 1,
          })
          .lean();

      const safePlans = [];

      for (
        const plan
        of plans
      ) {
        try {
          safePlans.push(
            planDTO(
              plan
            )
          );
        } catch (
          error
        ) {
          console.error(
            "CASH FLOW PLAN DECRYPT ERROR:",
            error instanceof Error
              ? error.message
              : error
          );
        }
      }

      res.status(
        200
      ).json({
        success:
          true,

        count:
          safePlans.length,

        plans:
          safePlans,
      });
    } catch (
      error
    ) {
      console.error(
        "GET CASH FLOW PLANS ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,
        message:
          "Failed to load cash-flow plans.",
      });
    }
  };

/* =========================================================
   CREATE PLAN
   POST /api/cash-flow/plans
========================================================= */

export const createCashFlowPlan =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success:
            false,
          message:
            "Not authorized",
        });

        return;
      }

      const title =
        normalizeText(
          req.body?.title,
          120
        );

      const category =
        normalizeText(
          req.body?.category,
          60
        ) ||
        "General";

      const type =
        normalizeType(
          req.body?.type
        );

      const amount =
        normalizeAmount(
          req.body?.amount
        );

      const date =
        new Date(
          req.body?.date
        );

      const isRecurring =
        req.body
          ?.isRecurring ===
        true;

      if (
        !title ||
        !type ||
        amount === null ||
        Number.isNaN(
          date.getTime()
        )
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Valid title, amount, type, and date are required.",
        });

        return;
      }

      const planDate =
        new Date(
          date
        );

      planDate.setHours(
        12,
        0,
        0,
        0
      );

      if (
        planDate <
        startOfToday()
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Cash-flow plans cannot be created in the past.",
        });

        return;
      }

      const minorUnits =
        Math.round(
          amount * 100
        );

      if (
        !Number.isSafeInteger(
          minorUnits
        ) ||
        minorUnits <= 0
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid amount.",
        });

        return;
      }

      const created =
        await CashFlowPlan.create(
          {
            userId,

            titleEncrypted:
              encryptData(
                title
              ),

            amountEncrypted:
              encryptData(
                String(
                  minorUnits
                )
              ),

            categoryEncrypted:
              encryptData(
                category
              ),

            type,

            date:
              planDate,

            isRecurring,
          }
        );

      res.status(
        201
      ).json({
        success:
          true,

        message:
          "Cash-flow plan created.",

        plan:
          planDTO(
            created
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "CREATE CASH FLOW PLAN ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,
        message:
          "Failed to create cash-flow plan.",
      });
    }
  };

/* =========================================================
   DELETE PLAN
   DELETE /api/cash-flow/plans/:id
========================================================= */

export const deleteCashFlowPlan =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      setPrivateNoStore(
        res
      );

      const userId =
        req.user?._id;

      if (!userId) {
        res.status(
          401
        ).json({
          success:
            false,
          message:
            "Not authorized",
        });

        return;
      }

      const rawId =
        req.params.id;

      const id =
        Array.isArray(
          rawId
        )
          ? rawId[0]
          : rawId;

      if (
        typeof id !==
          "string" ||
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid cash-flow plan ID.",
        });

        return;
      }

      const deleted =
        await CashFlowPlan.findOneAndDelete(
          {
            _id:
              id,

            userId,
          }
        );

      if (!deleted) {
        res.status(
          404
        ).json({
          success:
            false,
          message:
            "Cash-flow plan not found.",
        });

        return;
      }

      res.status(
        200
      ).json({
        success:
          true,

        message:
          "Cash-flow plan deleted.",

        id,
      });
    } catch (
      error
    ) {
      console.error(
        "DELETE CASH FLOW PLAN ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,
        message:
          "Failed to delete cash-flow plan.",
      });
    }
  };
