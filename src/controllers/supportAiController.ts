import type { Response } from "express";

import type { AuthRequest } from "../middlewares/authMiddleware.js";
import {
  analyzeSupportTicket,
} from "../services/supportAiService.js";

/* =========================================================
   ANALYZE SUPPORT TICKET
========================================================= */

export const analyzeSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.user?._id) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const ticketId =
        typeof req.params.id === "string"
          ? req.params.id
          : "";

      const analysis =
        await analyzeSupportTicket({
          ticketId,
        });

      res.status(200).json({
        success: true,
        analysis,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to analyze support ticket.";

      const status =
        message ===
        "Support ticket not found."
          ? 404
          : message ===
              "Invalid support ticket ID."
            ? 400
            : 500;

      res.status(status).json({
        success: false,
        message,
      });
    }
  };