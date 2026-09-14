import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportEscalationDetail,
  listSupportEscalations,
} from "../services/supportEscalationService.js";

/* =========================================================
   LIST ESCALATIONS
   GET /api/v1/support/escalations
========================================================= */

export const getSupportEscalationsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search
          : undefined;

      const priority =
        typeof req.query.priority ===
        "string"
          ? req.query.priority
          : undefined;

      const page =
        Number(
          req.query.page ?? 1
        );

      const limit =
        Number(
          req.query.limit ?? 20
        );

      const result =
        await listSupportEscalations({
          search,
          priority,
          page:
            Number.isFinite(
              page
            )
              ? page
              : 1,
          limit:
            Number.isFinite(
              limit
            )
              ? limit
              : 20,
        });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT ESCALATIONS ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load support escalations.",
      });
    }
  };

/* =========================================================
   ESCALATION DETAIL
   GET /api/v1/support/escalations/:id
========================================================= */

export const getSupportEscalationDetailController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const ticketId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const escalation =
        await getSupportEscalationDetail(
          ticketId
        );

      if (
        !escalation
      ) {
        res.status(404).json({
          success: false,
          message:
            "Escalated support ticket not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        escalation,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT ESCALATION DETAIL ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load escalation details.",
      });
    }
  };