import type {
  Response,
} from "express";

import mongoose from "mongoose";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  AnalystSettingsAudit,
} from "../models/AnalystSettingsAudit.js";

import {
  analystSettingsToDTO,
  getChangedAnalystSettingsFields,
  getOrCreateAnalystSettings,
  updateAnalystSettingsSectionAtomically,
} from "../services/analystSettingsService.js";

import {
  getAnalystSettingsLiveSnapshot,
} from "../services/analystSettingsLiveService.js";

import {
  isAnalystSettingsSection,
  validateAnalystSettingsSection,
} from "../services/analystSettingsValidation.js";

function userIdOf(
  req: AuthRequest
): string | null {
  return (
    req.user?._id ??
    null
  );
}

function auditToDTO(
  value: {
    _id: unknown;
    action: "SECTION_UPDATED";
    section: string;
    changedFields: string[];
    revision: number;
    actorRole: string;
    occurredAt: Date;
  }
) {
  return {
    id:
      String(
        value._id
      ),

    action:
      value.action,

    section:
      value.section,

    changedFields:
      value.changedFields ??
      [],

    revision:
      value.revision,

    actorRole:
      value.actorRole,

    occurredAt:
      new Date(
        value.occurredAt
      ).toISOString(),
  };
}

export async function getAnalystSettingsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId =
    userIdOf(
      req
    );

  if (!userId) {
    res.status(
      401
    ).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return;
  }

  try {
    const settings =
      await getOrCreateAnalystSettings(
        userId
      );

    const auditItems =
      await AnalystSettingsAudit.find({
        ownerId:
          new mongoose.Types.ObjectId(
            userId
          ),
      })
        .sort({
          occurredAt: -1,
        })
        .limit(
          20
        )
        .lean();

    res.status(
      200
    ).json({
      success:
        true,

      settings:
        analystSettingsToDTO(
          settings
        ),

      auditItems:
        auditItems.map(
          auditToDTO
        ),

      meta: {
        revision:
          settings.revision,

        updatedAt:
          settings.updatedAt,
      },
    });
  } catch (
    error
  ) {
    console.error(
      "GET ANALYST SETTINGS ERROR:",
      error
    );

    res.status(
      500
    ).json({
      success: false,
      message:
        "Unable to load Analyst Settings.",
    });
  }
}

export async function getAnalystSettingsLiveController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId =
    userIdOf(
      req
    );

  if (!userId) {
    res.status(
      401
    ).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return;
  }

  try {
    const settingsDocument =
      await getOrCreateAnalystSettings(
        userId
      );

    const settings =
      analystSettingsToDTO(
        settingsDocument
      );

    const live =
      await getAnalystSettingsLiveSnapshot({
        userId,
        settings,
      });

    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    res.status(
      200
    ).json({
      success: true,
      live,
    });
  } catch (
    error
  ) {
    console.error(
      "GET ANALYST SETTINGS LIVE ERROR:",
      error
    );

    res.status(
      500
    ).json({
      success: false,
      message:
        "Unable to load live Analyst Settings data.",
    });
  }
}

export async function updateAnalystSettingsSectionController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId =
    userIdOf(
      req
    );

  if (!userId) {
    res.status(
      401
    ).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return;
  }

  const section =
    String(
      req.params.section ||
      ""
    );

  if (
    !isAnalystSettingsSection(
      section
    )
  ) {
    res.status(
      400
    ).json({
      success: false,
      message:
        "Unknown Analyst Settings section.",
    });

    return;
  }

  const revision =
    Number(
      req.body?.revision
    );

  if (
    !Number.isSafeInteger(
      revision
    ) ||
    revision < 1
  ) {
    res.status(
      400
    ).json({
      success: false,
      message:
        "A valid Analyst Settings revision is required.",
    });

    return;
  }

  const validation =
    validateAnalystSettingsSection(
      section,
      req.body?.settings
    );

  if (
    !validation.ok
  ) {
    res.status(
      400
    ).json({
      success: false,
      message:
        validation.message,
      field:
        validation.field,
    });

    return;
  }

  try {
    const current =
      await getOrCreateAnalystSettings(
        userId
      );

    if (
      current.revision !==
      revision
    ) {
      res.status(
        409
      ).json({
        success: false,
        code:
          "ANALYST_SETTINGS_CONFLICT",
        message:
          "Analyst Settings changed in another session. Refresh and try again.",
      });

      return;
    }

    const before =
      analystSettingsToDTO(
        current
      );

    const changedFields =
      getChangedAnalystSettingsFields(
        section,
        before[
          section
        ],
        validation.value
      );

    if (
      changedFields.length ===
      0
    ) {
      res.status(
        200
      ).json({
        success: true,
        message:
          "No changes were detected.",
        settings:
          before,
        meta: {
          revision:
            current.revision,
          updatedAt:
            current.updatedAt,
        },
      });

      return;
    }

    const updated =
      await updateAnalystSettingsSectionAtomically({
        userId,
        section,
        value:
          validation.value,
        revision,
      });

    if (!updated) {
      res.status(
        409
      ).json({
        success: false,
        code:
          "ANALYST_SETTINGS_CONFLICT",
        message:
          "Analyst Settings changed in another session. Refresh and try again.",
      });

      return;
    }

    try {
      await AnalystSettingsAudit.create({
        ownerId:
          new mongoose.Types.ObjectId(
            userId
          ),

        actorId:
          new mongoose.Types.ObjectId(
            userId
          ),

        actorRole:
          req.user?.role ??
          "analyst",

        action:
          "SECTION_UPDATED",

        section,

        changedFields,

        revision:
          updated.revision,

        occurredAt:
          new Date(),
      });
    } catch (
      auditError
    ) {
      console.error(
        "ANALYST SETTINGS AUDIT ERROR:",
        auditError
      );
    }

    res.status(
      200
    ).json({
      success: true,
      message:
        `${section} settings updated successfully.`,
      settings:
        analystSettingsToDTO(
          updated
        ),
      meta: {
        revision:
          updated.revision,
        updatedAt:
          updated.updatedAt,
      },
    });
  } catch (
    error
  ) {
    console.error(
      "UPDATE ANALYST SETTINGS ERROR:",
      error
    );

    res.status(
      500
    ).json({
      success: false,
      message:
        "Unable to update Analyst Settings.",
    });
  }
}

export async function getAnalystSettingsAuditController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId =
    userIdOf(
      req
    );

  if (!userId) {
    res.status(
      401
    ).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return;
  }

  try {
    const items =
      await AnalystSettingsAudit.find({
        ownerId:
          new mongoose.Types.ObjectId(
            userId
          ),
      })
        .sort({
          occurredAt: -1,
        })
        .limit(
          100
        )
        .lean();

    res.status(
      200
    ).json({
      success: true,
      items:
        items.map(
          auditToDTO
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "GET ANALYST SETTINGS AUDIT ERROR:",
      error
    );

    res.status(
      500
    ).json({
      success: false,
      message:
        "Unable to load Analyst Settings audit.",
    });
  }
}
