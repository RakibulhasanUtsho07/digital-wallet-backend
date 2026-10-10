import crypto from "node:crypto";

import {
  Response,
} from "express";

import mongoose from "mongoose";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";
import { getChangedSectionFields, getOrCreateSupportSettings, supportSettingsToDTO, updateSupportSettingsSectionAtomically } from "../services/supportSettingsService.js";
import SupportSettingsAudit from "../models/SupportSettingsAudit.js";
import { isSupportSettingsSection, validateSupportSettingsSection } from "../services/supportSettingsValidation.js";


const auditToDTO =
  (
    value: {
      _id:
        unknown;

      action:
        string;

      section:
        string;

      changedFields:
        string[];

      revision:
        number;

      occurredAt:
        Date;
    }
  ) => {
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

      occurredAt:
        new Date(
          value.occurredAt
        ).toISOString(),
    };
  };

export const getSupportSettings =
  async (
    _req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const settings =
        await getOrCreateSupportSettings();

      const auditItems =
        await SupportSettingsAudit.find()
          .sort({
            occurredAt:
              -1,
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
          supportSettingsToDTO(
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
        "GET SUPPORT SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load support settings.",
      });
    }
  };

export const updateSupportSettingsSection =
  async (
    req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    const userId =
      req.user?._id;

    if (
      !userId
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Not authorized.",
      });

      return;
    }

    const sectionRaw =
      String(
        req.params
          .section ||
        ""
      );

    if (
      !isSupportSettingsSection(
        sectionRaw
      )
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Unknown support settings section.",
      });

      return;
    }

    const revision =
      Number(
        req.body
          ?.revision
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
        success:
          false,

        message:
          "A valid support settings revision is required.",
      });

      return;
    }

    const validation =
      validateSupportSettingsSection(
        sectionRaw,
        req.body
          ?.settings
      );

    if (
      !validation.ok
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          validation.message,
      });

      return;
    }

    const session =
      await mongoose.startSession();

    let responsePayload:
      | {
          settings:
            ReturnType<
              typeof supportSettingsToDTO
            >;

          revision:
            number;

          updatedAt:
            Date;

          noChange:
            boolean;
        }
      | undefined;

    try {
      await session.withTransaction(
        async () => {
          const current =
            await getOrCreateSupportSettings(
              session
            );

          if (
            current.revision !==
            revision
          ) {
            throw new Error(
              "SUPPORT_SETTINGS_CONFLICT"
            );
          }

          const before =
            supportSettingsToDTO(
              current
            );

          const beforeSection =
            before[
              sectionRaw
            ];

          const afterSection =
            validation.value;

          const changedFields =
            getChangedSectionFields(
              sectionRaw,
              beforeSection,
              afterSection
            );

          if (
            changedFields.length ===
            0
          ) {
            responsePayload = {
              settings:
                before,

              revision:
                current.revision,

              updatedAt:
                current.updatedAt,

              noChange:
                true,
            };

            return;
          }

          const updated =
            await updateSupportSettingsSectionAtomically({
              section:
                sectionRaw,

              value:
                afterSection,

              revision:
                current.revision,

              userId,

              session,
            });

          if (
            !updated
          ) {
            throw new Error(
              "SUPPORT_SETTINGS_CONFLICT"
            );
          }

          await SupportSettingsAudit.create(
            [
              {
                actorId:
                  new mongoose.Types.ObjectId(
                    userId
                  ),

                actorRole:
                  "support",

                action:
                  "SECTION_UPDATED",

                section:
                  sectionRaw,

                changedFields,

                revision:
                  updated.revision,

                requestId:
                  String(
                    req.get(
                      "x-request-id"
                    ) ||
                    crypto.randomUUID()
                  ).slice(
                    0,
                    120
                  ),

                occurredAt:
                  new Date(),
              },
            ],
            {
              session,
            }
          );

          responsePayload = {
            settings:
              supportSettingsToDTO(
                updated
              ),

            revision:
              updated.revision,

            updatedAt:
              updated.updatedAt,

            noChange:
              false,
          };
        }
      );

      if (
        !responsePayload
      ) {
        throw new Error(
          "Support settings update returned no result."
        );
      }

      res.status(
        200
      ).json({
        success:
          true,

        message:
          responsePayload
            .noChange
            ? "No changes were detected in this section."
            : `${sectionRaw} settings updated successfully.`,

        settings:
          responsePayload
            .settings,

        meta: {
          revision:
            responsePayload
              .revision,

          updatedAt:
            responsePayload
              .updatedAt,
        },
      });
    } catch (
      error
    ) {
      if (
        error instanceof
          Error &&
        (
          error.message ===
            "SUPPORT_SETTINGS_CONFLICT" ||
          error.message.includes(
            "WriteConflict"
          )
        )
      ) {
        res.status(
          409
        ).json({
          success:
            false,

          code:
            "SETTINGS_CONFLICT",

          message:
            "Support settings changed in another session. Refresh and try again.",
        });

        return;
      }

      console.error(
        "UPDATE SUPPORT SETTINGS ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to update support settings.",
      });
    } finally {
      await session.endSession();
    }
  };

export const getSupportSettingsAudit =
  async (
    req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const page =
        Math.max(
          Number(
            req.query
              .page
          ) ||
            1,
          1
        );

      const limit =
        Math.min(
          Math.max(
            Number(
              req.query
                .limit
            ) ||
              25,
            1
          ),
          100
        );

      const total =
        await SupportSettingsAudit.countDocuments();

      const items =
        await SupportSettingsAudit.find()
          .sort({
            occurredAt:
              -1,
          })
          .skip(
            (
              page -
              1
            ) *
              limit
          )
          .limit(
            limit
          )
          .lean();

      res.status(
        200
      ).json({
        success:
          true,

        items:
          items.map(
            auditToDTO
          ),

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.max(
              1,
              Math.ceil(
                total /
                limit
              )
            ),
        },
      });
    } catch (
      error
    ) {
      console.error(
        "GET SUPPORT SETTINGS AUDIT ERROR:",
        error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load support settings audit.",
      });
    }
  };
