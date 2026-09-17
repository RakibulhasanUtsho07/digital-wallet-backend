import mongoose from "mongoose";

import type {
  Request,
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import type {
  MerchantApiScope,
} from "../models/MerchantApiKey.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  cancelMerchantDashboardInvoice,
  createMerchantDashboardInvoice,
  createMerchantInvoice,
  getMerchantApiInvoice,
  getMerchantDashboardInvoice,
  getPublicInvoice,
  listMerchantDashboardInvoices,
  MerchantInvoiceError,
  sendMerchantDashboardInvoice,
} from "../services/merchantInvoiceService.js";

import type {
  InvoiceMode,
} from "../models/Invoice.js";

/* =========================================================
   MERCHANT API REQUEST
========================================================= */

interface MerchantApiRequest
  extends AuthRequest {
  merchant?: {
    _id: string;
    ownerId: string;
    businessName: string;
    slug: string;
    status: string;
    verificationStatus: string;
    defaultCurrency: string;
    environment:
      "test" | "live";
    apiKeyId: string;
    scopes:
      MerchantApiScope[];
  };
}

/* =========================================================
   HELPERS
========================================================= */

function readText(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function readHeader(
  value: unknown
): string {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(value) &&
    typeof value[0] === "string"
  ) {
    return value[0].trim();
  }

  return "";
}

function readMode(
  value: unknown
): InvoiceMode {
  const mode =
    readText(value)
      .toLowerCase();

  if (
    mode !== "test" &&
    mode !== "live"
  ) {
    throw new MerchantInvoiceError(
      'Invoice mode must be either "test" or "live".',
      400,
      "INVALID_REQUEST"
    );
  }

  return mode;
}

function readPageNumber(
  value: unknown,
  fallback: number
): number {
  const parsed =
    Number(
      readText(value)
    );

  return (
    Number.isInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : fallback;
}

function requestBody(
  req: Request
): Record<string, unknown> {
  return (
    req.body &&
    typeof req.body === "object"
  )
    ? req.body as
        Record<string, unknown>
    : {};
}

function sendInvoiceError(
  error: unknown,
  res: Response
): void {
  if (
    error instanceof
    MerchantInvoiceError
  ) {
    res.status(
      error.statusCode
    ).json({
      success: false,
      code:
        error.code,
      message:
        error.message,
    });

    return;
  }

  console.error(
    "MERCHANT INVOICE ERROR:",
    error instanceof Error
      ? error.message
      : error
  );

  res.status(500).json({
    success: false,
    message:
      "Unable to process invoice request.",
  });
}

/* =========================================================
   DASHBOARD CREATE
   POST /api/merchants/invoices
========================================================= */

export const createMerchantDashboardInvoiceController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const body =
        requestBody(req);

      const idempotencyKey =
        readHeader(
          req.headers[
            "idempotency-key"
          ]
        );

      const result =
        await createMerchantDashboardInvoice({
          ownerId,

          mode:
            readMode(
              body.mode
            ),

          customer:
            (
              body.customer &&
              typeof body.customer ===
                "object"
            )
              ? body.customer as {
                  userId?: unknown;
                  name?: unknown;
                  email?: unknown;
                  phone?: unknown;
                }
              : {},

          items:
            Array.isArray(
              body.items
            )
              ? body.items as Array<{
                  name: unknown;
                  description?: unknown;
                  quantity: unknown;
                  unitAmount: unknown;
                }>
              : [],

          currency:
            body.currency,

          taxAmount:
            body.taxAmount,

          discountAmount:
            body.discountAmount,

          dueDate:
            body.dueDate,

          title:
            body.title,

          note:
            body.note,

          footer:
            body.footer,

          merchantReference:
            body.merchantReference,

          idempotencyKey,
        });

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Existing invoice returned."
            : "Invoice created successfully.",

        invoice:
          result.invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD LIST
   GET /api/merchants/invoices
========================================================= */

export const listMerchantDashboardInvoicesController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const result =
        await listMerchantDashboardInvoices({
          ownerId,

          status:
            readText(
              req.query.status
            ) ||
            undefined,

          mode:
            readText(
              req.query.mode
            ) ||
            undefined,

          search:
            readText(
              req.query.search
            ) ||
            undefined,

          page:
            readPageNumber(
              req.query.page,
              1
            ),

          limit:
            readPageNumber(
              req.query.limit,
              20
            ),
        });

      res.status(200).json({
        success: true,

        invoices:
          result.invoices,

        pagination:
          result.pagination,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD DETAILS
   GET /api/merchants/invoices/:invoiceId
========================================================= */

export const getMerchantDashboardInvoiceController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const invoice =
        await getMerchantDashboardInvoice({
          ownerId,

          invoiceId:
            readText(
              req.params.invoiceId
            ),
        });

      res.status(200).json({
        success: true,
        invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD SEND
   POST /api/merchants/invoices/:invoiceId/send
========================================================= */

export const sendMerchantDashboardInvoiceController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const result =
        await sendMerchantDashboardInvoice({
          ownerId,

          invoiceId:
            readText(
              req.params.invoiceId
            ),
        });

      res.status(200).json({
        success: true,

        message:
          "Invoice sent successfully.",

        invoice:
          result.invoice,

        publicUrl:
          result.publicUrl,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD CANCEL
   POST /api/merchants/invoices/:invoiceId/cancel
========================================================= */

export const cancelMerchantDashboardInvoiceController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const invoice =
        await cancelMerchantDashboardInvoice({
          ownerId,

          invoiceId:
            readText(
              req.params.invoiceId
            ),
        });

      res.status(200).json({
        success: true,

        message:
          "Invoice cancelled successfully.",

        invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   MERCHANT API CREATE
   POST /api/v1/invoices
========================================================= */

export const createMerchantApiInvoiceController =
  async (
    req:
      MerchantApiRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant) {
        res.status(401).json({
          success: false,
          message:
            "Merchant authentication is required.",
        });

        return;
      }

      const body =
        requestBody(req);

      const result =
        await createMerchantInvoice({
          merchantId:
            merchant._id,

          mode:
            merchant.environment,

          customer:
            (
              body.customer &&
              typeof body.customer ===
                "object"
            )
              ? body.customer as {
                  userId?: unknown;
                  name?: unknown;
                  email?: unknown;
                  phone?: unknown;
                }
              : {},

          items:
            Array.isArray(
              body.items
            )
              ? body.items as Array<{
                  name: unknown;
                  description?: unknown;
                  quantity: unknown;
                  unitAmount: unknown;
                }>
              : [],

          currency:
            body.currency,

          taxAmount:
            body.taxAmount,

          discountAmount:
            body.discountAmount,

          dueDate:
            body.dueDate,

          title:
            body.title,

          note:
            body.note,

          footer:
            body.footer,

          merchantReference:
            body.merchantReference,

          idempotencyKey:
            readHeader(
              req.headers[
                "idempotency-key"
              ]
            ),
        });

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        invoice:
          result.invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   MERCHANT API DETAILS
   GET /api/v1/invoices/:invoiceId
========================================================= */

export const getMerchantApiInvoiceController =
  async (
    req:
      MerchantApiRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant) {
        res.status(401).json({
          success: false,
          message:
            "Merchant authentication is required.",
        });

        return;
      }

      const invoice =
        await getMerchantApiInvoice({
          merchantId:
            merchant._id,

          mode:
            merchant.environment,

          invoiceId:
            readText(
              req.params.invoiceId
            ),
        });

      res.status(200).json({
        success: true,
        invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };

/* =========================================================
   PUBLIC INVOICE
   GET /api/public/invoices/:invoiceId
========================================================= */

export const getPublicInvoiceController =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const token =
        readHeader(
          req.headers[
            "x-invoice-token"
          ]
        );

      const invoice =
        await getPublicInvoice({
          invoiceId:
            readText(
              req.params.invoiceId
            ),

          token,
        });

      const merchant =
        mongoose.isValidObjectId(
          invoice.merchantId
        )
          ? await Merchant.findById(
              invoice.merchantId
            )
              .select(
                "businessName businessDisplayName slug websiteUrl"
              )
              .lean()
          : null;

      res.setHeader(
        "Cache-Control",
        "no-store, private"
      );

      res.status(200).json({
        success: true,

        merchant:
          merchant
            ? {
                businessName:
                  merchant.businessName,

                businessDisplayName:
                  merchant.businessDisplayName,

                slug:
                  merchant.slug,

                websiteUrl:
                  merchant.websiteUrl,
              }
            : null,

        invoice,
      });
    } catch (
      error: unknown
    ) {
      sendInvoiceError(
        error,
        res
      );
    }
  };