import mongoose from "mongoose";
import { Response } from "express";

import {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Receipt,
  type ReceiptStatus,
} from "../models/Receipt.js";

import {
  decryptData,
  encryptData,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface IncomingLineItem {
  name?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  total?: unknown;
  category?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

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

function normalizeOptionalDate(
  value: unknown
):
  | Date
  | undefined
  | null {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value === ""
  ) {
    return undefined;
  }

  const date =
    new Date(
      String(
        value
      )
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function normalizeReceiptDate(
  value: unknown
):
  | Date
  | null {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value === ""
  ) {
    return new Date();
  }

  const date =
    new Date(
      String(
        value
      )
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function normalizeStatus(
  value: unknown
):
  | ReceiptStatus
  | null {
  const allowed:
    ReceiptStatus[] = [
      "normal",
      "warranty_active",
      "warranty_expiring",
      "return_open",
    ];

  return allowed.includes(
    value as ReceiptStatus
  )
    ? (
        value as ReceiptStatus
      )
    : null;
}

function normalizeMoney(
  value: unknown,
  allowZero = true
) {
  const amount =
    Number(
      value
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <
      (
        allowZero
          ? 0
          : 0.01
      )
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

function moneyToMinorUnits(
  amount: number
) {
  const minorUnits =
    Math.round(
      amount * 100
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits < 0
  ) {
    throw new Error(
      "Invalid receipt amount."
    );
  }

  return minorUnits;
}

function encryptMoney(
  amount: number
) {
  return encryptData(
    String(
      moneyToMinorUnits(
        amount
      )
    )
  );
}

function decryptValue(
  value: unknown
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return "";
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
    return "";
  }

  try {
    return decryptData({
      encrypted:
        data.encrypted,
      iv:
        data.iv,
      authTag:
        data.authTag,
    });
  } catch (
    error
  ) {
    console.error(
      "RECEIPT DECRYPT ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    return "";
  }
}

function decryptMoney(
  value: unknown,
  fallback = 0
) {
  const decrypted =
    decryptValue(
      value
    );

  if (!decrypted) {
    return fallback;
  }

  const minorUnits =
    Number(
      decrypted
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits < 0
  ) {
    return fallback;
  }

  return minorUnits /
    100;
}

function currencySymbol(
  value: unknown
) {
  return value === "BDT" ||
    value === "৳" ||
    !value
    ? "৳"
    : String(
        value
      );
}

function receiptDTO(
  receipt: any
) {
  const merchant =
    decryptValue(
      receipt.merchantEncrypted
    ) ||
    receipt.merchantName ||
    "";

  const total =
    receipt.amountEncrypted
      ? decryptMoney(
          receipt.amountEncrypted
        )
      : Number(
          receipt.amount ||
            0
        );

  const tax =
    receipt.taxEncrypted
      ? decryptMoney(
          receipt.taxEncrypted
        )
      : Number(
          receipt.tax ||
            0
        );

  const category =
    decryptValue(
      receipt.categoryEncrypted
    ) ||
    receipt.category ||
    "Uncategorized";

  const paymentMethod =
    decryptValue(
      receipt.paymentMethodEncrypted
    ) ||
    receipt.paymentMethod ||
    "";

  const receiptNumber =
    decryptValue(
      receipt.receiptNumberEncrypted
    ) ||
    receipt.receiptNumber ||
    "";

  const tags =
    Array.isArray(
      receipt.tagsEncrypted
    ) &&
    receipt.tagsEncrypted.length >
      0
      ? receipt.tagsEncrypted
          .map(
            decryptValue
          )
          .filter(
            Boolean
          )
      : Array.isArray(
          receipt.tags
        )
        ? receipt.tags
        : [];

  const lineItems =
    Array.isArray(
      receipt.lineItems
    )
      ? receipt.lineItems.map(
          (
            item: any
          ) => ({
            id:
              String(
                item._id
              ),

            name:
              decryptValue(
                item.nameEncrypted
              ),

            quantity:
              Number(
                item.quantity ||
                  1
              ),

            unitPrice:
              decryptMoney(
                item.unitPriceEncrypted
              ),

            total:
              decryptMoney(
                item.totalEncrypted
              ),

            category:
              decryptValue(
                item.categoryEncrypted
              ) ||
              "Uncategorized",
          })
        )
      : [];

  return {
    id:
      String(
        receipt._id
      ),

    merchant,

    date:
      new Date(
        receipt.receiptDate
      )
        .toISOString()
        .split(
          "T"
        )[0],

    total,

    tax,

    currency:
      currencySymbol(
        receipt.currency
      ),

    category,

    paymentMethod,

    receiptNumber,

    status:
      receipt.status ||
      "normal",

    warrantyExpiry:
      receipt.warrantyExpiry
        ? new Date(
            receipt.warrantyExpiry
          )
            .toISOString()
            .split(
              "T"
            )[0]
        : undefined,

    returnDeadline:
      receipt.returnDeadline
        ? new Date(
            receipt.returnDeadline
          )
            .toISOString()
            .split(
              "T"
            )[0]
        : undefined,

    isFavorite:
      Boolean(
        receipt.isFavorite
      ),

    tags,

    lineItems,

    imageUrl:
      receipt.imageUrl ||
      undefined,

    isAiParsed:
      Boolean(
        receipt.isAiParsed
      ),

    createdAt:
      receipt.createdAt,

    updatedAt:
      receipt.updatedAt,
  };
}

function normalizeTags(
  value: unknown
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  const unique =
    new Set<string>();

  for (
    const item
    of value
  ) {
    const tag =
      normalizeText(
        item,
        32
      );

    if (tag) {
      unique.add(
        tag
      );
    }

    if (
      unique.size >=
      12
    ) {
      break;
    }
  }

  return [
    ...unique,
  ];
}

function normalizeLineItems(
  value: unknown
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  const items = [];

  for (
    const raw
    of value.slice(
      0,
      30
    )
  ) {
    const item =
      raw as IncomingLineItem;

    const name =
      normalizeText(
        item.name,
        120
      );

    const category =
      normalizeText(
        item.category,
        60
      ) ||
      "Uncategorized";

    const quantity =
      Math.max(
        1,
        Math.floor(
          Number(
            item.quantity
          ) ||
          1
        )
      );

    const unitPrice =
      normalizeMoney(
        item.unitPrice,
        true
      );

    const total =
      normalizeMoney(
        item.total,
        true
      );

    if (
      !name ||
      unitPrice ===
        null ||
      total ===
        null
    ) {
      continue;
    }

    items.push({
      nameEncrypted:
        encryptData(
          name
        ),

      quantity,

      unitPriceEncrypted:
        encryptMoney(
          unitPrice
        ),

      totalEncrypted:
        encryptMoney(
          total
        ),

      categoryEncrypted:
        encryptData(
          category
        ),
    });
  }

  return items;
}

function getReceiptId(
  req: AuthRequest
) {
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
    return null;
  }

  return id;
}

/* =========================================================
   GET USER RECEIPTS
   GET /api/receipts
========================================================= */

export const getReceipts =
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

      const receipts =
        await Receipt.find(
          {
            userId,
          }
        )
          .sort({
            receiptDate: -1,
            createdAt: -1,
          })
          .lean();

      res.status(
        200
      ).json({
        success:
          true,

        count:
          receipts.length,

        receipts:
          receipts.map(
            receiptDTO
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "GET RECEIPTS ERROR:",
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
          "Failed to load receipts.",
      });
    }
  };

/* =========================================================
   GET SINGLE RECEIPT
   GET /api/receipts/:id
========================================================= */

export const getReceiptById =
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

      const id =
        getReceiptId(
          req
        );

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

      if (!id) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid receipt ID.",
        });

        return;
      }

      const receipt =
        await Receipt.findOne(
          {
            _id:
              id,

            userId,
          }
        ).lean();

      if (!receipt) {
        res.status(
          404
        ).json({
          success:
            false,
          message:
            "Receipt not found.",
        });

        return;
      }

      res.status(
        200
      ).json({
        success:
          true,

        receipt:
          receiptDTO(
            receipt
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "GET RECEIPT ERROR:",
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
          "Failed to load receipt.",
      });
    }
  };

/* =========================================================
   ADD RECEIPT
   POST /api/receipts
========================================================= */

export const addReceipt =
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

      const merchant =
        normalizeText(
          req.body?.merchant ??
            req.body
              ?.merchantName,
          120
        );

      const total =
        normalizeMoney(
          req.body?.total ??
            req.body?.amount,
          false
        );

      const tax =
        normalizeMoney(
          req.body?.tax ??
            0,
          true
        );

      const category =
        normalizeText(
          req.body?.category,
          60
        ) ||
        "Uncategorized";

      const paymentMethod =
        normalizeText(
          req.body
            ?.paymentMethod,
          120
        );

      const receiptNumber =
        normalizeText(
          req.body
            ?.receiptNumber,
          120
        );

      const receiptDate =
        normalizeReceiptDate(
          req.body?.date ??
            req.body
              ?.receiptDate
        );

      const status =
        normalizeStatus(
          req.body?.status ??
            "normal"
        );

      const warrantyExpiry =
        normalizeOptionalDate(
          req.body
            ?.warrantyExpiry
        );

      const returnDeadline =
        normalizeOptionalDate(
          req.body
            ?.returnDeadline
        );

      if (
        !merchant ||
        total === null ||
        tax === null ||
        !receiptDate ||
        !status ||
        warrantyExpiry ===
          null ||
        returnDeadline ===
          null
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Valid merchant, amount, date, and receipt details are required.",
        });

        return;
      }

      const tags =
        normalizeTags(
          req.body?.tags
        );

      const lineItems =
        normalizeLineItems(
          req.body
            ?.lineItems
        );

      const receipt =
        await Receipt.create(
          {
            userId,

            merchantEncrypted:
              encryptData(
                merchant
              ),

            amountEncrypted:
              encryptMoney(
                total
              ),

            taxEncrypted:
              encryptMoney(
                tax
              ),

            categoryEncrypted:
              encryptData(
                category
              ),

            paymentMethodEncrypted:
              paymentMethod
                ? encryptData(
                    paymentMethod
                  )
                : undefined,

            receiptNumberEncrypted:
              receiptNumber
                ? encryptData(
                    receiptNumber
                  )
                : undefined,

            tagsEncrypted:
              tags.map(
                (
                  tag
                ) =>
                  encryptData(
                    tag
                  )
              ),

            lineItems,

            currency:
              req.body
                ?.currency ===
                "৳"
                ? "BDT"
                : (
                    normalizeText(
                      req.body
                        ?.currency,
                      8
                    ) ||
                    "BDT"
                  ),

            receiptDate,

            status,

            warrantyExpiry,

            returnDeadline,

            isFavorite:
              req.body
                ?.isFavorite ===
              true,

            imageUrl:
              normalizeText(
                req.body
                  ?.imageUrl,
                1000
              ) ||
              undefined,

            imagePublicId:
              normalizeText(
                req.body
                  ?.imagePublicId,
                300
              ) ||
              undefined,

            isAiParsed:
              req.body
                ?.isAiParsed ===
              true,
          }
        );

      res.status(
        201
      ).json({
        success:
          true,

        message:
          "Receipt saved successfully.",

        receipt:
          receiptDTO(
            receipt
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "ADD RECEIPT ERROR:",
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
          "Failed to save receipt.",
      });
    }
  };

/* =========================================================
   UPDATE RECEIPT
   PATCH /api/receipts/:id
========================================================= */

export const updateReceipt =
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

      const id =
        getReceiptId(
          req
        );

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

      if (!id) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid receipt ID.",
        });

        return;
      }

      const receipt =
        await Receipt.findOne(
          {
            _id:
              id,

            userId,
          }
        );

      if (!receipt) {
        res.status(
          404
        ).json({
          success:
            false,
          message:
            "Receipt not found.",
        });

        return;
      }

      if (
        req.body?.merchant !==
          undefined ||
        req.body
          ?.merchantName !==
          undefined
      ) {
        const merchant =
          normalizeText(
            req.body
              ?.merchant ??
              req.body
                ?.merchantName,
            120
          );

        if (!merchant) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Merchant name cannot be empty.",
          });

          return;
        }

        receipt.merchantEncrypted =
          encryptData(
            merchant
          );

        receipt.merchantName =
          undefined;
      }

      if (
        req.body?.total !==
          undefined ||
        req.body?.amount !==
          undefined
      ) {
        const total =
          normalizeMoney(
            req.body
              ?.total ??
              req.body
                ?.amount,
            false
          );

        if (
          total === null
        ) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid receipt total.",
          });

          return;
        }

        receipt.amountEncrypted =
          encryptMoney(
            total
          );

        receipt.amount =
          undefined;
      }

      if (
        req.body?.tax !==
        undefined
      ) {
        const tax =
          normalizeMoney(
            req.body
              ?.tax,
            true
          );

        if (
          tax === null
        ) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid tax amount.",
          });

          return;
        }

        receipt.taxEncrypted =
          encryptMoney(
            tax
          );

        receipt.tax =
          undefined;
      }

      if (
        req.body
          ?.category !==
        undefined
      ) {
        const category =
          normalizeText(
            req.body
              ?.category,
            60
          ) ||
          "Uncategorized";

        receipt.categoryEncrypted =
          encryptData(
            category
          );

        receipt.category =
          undefined;
      }

      if (
        req.body
          ?.paymentMethod !==
        undefined
      ) {
        const value =
          normalizeText(
            req.body
              ?.paymentMethod,
            120
          );

        receipt.paymentMethodEncrypted =
          value
            ? encryptData(
                value
              )
            : undefined;

        receipt.paymentMethod =
          undefined;
      }

      if (
        req.body
          ?.receiptNumber !==
        undefined
      ) {
        const value =
          normalizeText(
            req.body
              ?.receiptNumber,
            120
          );

        receipt.receiptNumberEncrypted =
          value
            ? encryptData(
                value
              )
            : undefined;

        receipt.receiptNumber =
          undefined;
      }

      if (
        req.body?.date !==
          undefined ||
        req.body
          ?.receiptDate !==
          undefined
      ) {
        const date =
          normalizeReceiptDate(
            req.body
              ?.date ??
              req.body
                ?.receiptDate
          );

        if (!date) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid receipt date.",
          });

          return;
        }

        receipt.receiptDate =
          date;
      }

      if (
        req.body?.status !==
        undefined
      ) {
        const status =
          normalizeStatus(
            req.body
              ?.status
          );

        if (!status) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid receipt status.",
          });

          return;
        }

        receipt.status =
          status;
      }

      if (
        req.body
          ?.warrantyExpiry !==
        undefined
      ) {
        const date =
          normalizeOptionalDate(
            req.body
              ?.warrantyExpiry
          );

        if (
          date === null
        ) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid warranty date.",
          });

          return;
        }

        receipt.warrantyExpiry =
          date;
      }

      if (
        req.body
          ?.returnDeadline !==
        undefined
      ) {
        const date =
          normalizeOptionalDate(
            req.body
              ?.returnDeadline
          );

        if (
          date === null
        ) {
          res.status(
            400
          ).json({
            success:
              false,
            message:
              "Invalid return deadline.",
          });

          return;
        }

        receipt.returnDeadline =
          date;
      }

      if (
        req.body
          ?.isFavorite !==
        undefined
      ) {
        receipt.isFavorite =
          req.body
            ?.isFavorite ===
          true;
      }

      if (
        req.body?.tags !==
        undefined
      ) {
        const tags =
          normalizeTags(
            req.body
              ?.tags
          );

        receipt.tagsEncrypted =
          tags.map(
            (
              tag
            ) =>
              encryptData(
                tag
              )
          );

        receipt.tags =
          undefined;
      }

      if (
        req.body
          ?.lineItems !==
        undefined
      ) {
        receipt.lineItems =
          normalizeLineItems(
            req.body
              ?.lineItems
          ) as any;
      }

      await receipt.save();

      res.status(
        200
      ).json({
        success:
          true,

        message:
          "Receipt updated successfully.",

        receipt:
          receiptDTO(
            receipt
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "UPDATE RECEIPT ERROR:",
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
          "Failed to update receipt.",
      });
    }
  };

/* =========================================================
   FAVORITE
   PATCH /api/receipts/:id/favorite
========================================================= */

export const toggleReceiptFavorite =
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

      const id =
        getReceiptId(
          req
        );

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

      if (!id) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid receipt ID.",
        });

        return;
      }

      const receipt =
        await Receipt.findOne(
          {
            _id:
              id,

            userId,
          }
        );

      if (!receipt) {
        res.status(
          404
        ).json({
          success:
            false,
          message:
            "Receipt not found.",
        });

        return;
      }

      const nextValue =
        typeof req.body
          ?.isFavorite ===
          "boolean"
          ? req.body
              .isFavorite
          : !receipt
              .isFavorite;

      receipt.isFavorite =
        nextValue;

      await receipt.save();

      res.status(
        200
      ).json({
        success:
          true,

        message:
          nextValue
            ? "Receipt added to favorites."
            : "Receipt removed from favorites.",

        receipt:
          receiptDTO(
            receipt
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "FAVORITE RECEIPT ERROR:",
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
          "Failed to update favorite status.",
      });
    }
  };

/* =========================================================
   ADD TAG
   POST /api/receipts/:id/tags
========================================================= */

export const addReceiptTag =
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

      const id =
        getReceiptId(
          req
        );

      const tag =
        normalizeText(
          req.body?.tag,
          32
        );

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

      if (
        !id ||
        !tag
      ) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Valid receipt ID and tag are required.",
        });

        return;
      }

      const receipt =
        await Receipt.findOne(
          {
            _id:
              id,

            userId,
          }
        );

      if (!receipt) {
        res.status(
          404
        ).json({
          success:
            false,
          message:
            "Receipt not found.",
        });

        return;
      }

      const currentTags =
        receiptDTO(
          receipt
        ).tags as string[];

      if (
        !currentTags.some(
          (
            item
          ) =>
            item.toLowerCase() ===
            tag.toLowerCase()
        )
      ) {
        currentTags.push(
          tag
        );
      }

      receipt.tagsEncrypted =
        currentTags
          .slice(
            0,
            12
          )
          .map(
            (
              item
            ) =>
              encryptData(
                item
              )
          );

      receipt.tags =
        undefined;

      await receipt.save();

      res.status(
        200
      ).json({
        success:
          true,

        message:
          "Tag added.",

        receipt:
          receiptDTO(
            receipt
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "ADD RECEIPT TAG ERROR:",
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
          "Failed to add tag.",
      });
    }
  };

/* =========================================================
   DELETE RECEIPT
   DELETE /api/receipts/:id
========================================================= */

export const deleteReceipt =
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

      const id =
        getReceiptId(
          req
        );

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

      if (!id) {
        res.status(
          400
        ).json({
          success:
            false,
          message:
            "Invalid receipt ID.",
        });

        return;
      }

      const deleted =
        await Receipt.findOneAndDelete(
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
            "Receipt not found.",
        });

        return;
      }

      res.status(
        200
      ).json({
        success:
          true,

        message:
          "Receipt deleted.",

        id,
      });
    } catch (
      error
    ) {
      console.error(
        "DELETE RECEIPT ERROR:",
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
          "Failed to delete receipt.",
      });
    }
  };
