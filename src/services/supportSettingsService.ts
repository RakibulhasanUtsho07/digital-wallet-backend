import mongoose, {
  type ClientSession,
} from "mongoose";

import {
  SupportSettings,
} from "../models/SupportSettings.js";

import type {
  SupportSettingsPayload,
  SupportSettingsSection,
} from "./supportSettingsTypes.js";

/* =========================================================
   DEFAULT SETTINGS
========================================================= */

export const SUPPORT_SETTINGS_DEFAULTS:
  SupportSettingsPayload = {
  general: {
    workspaceName:
      "Coffer Support",

    timezone:
      "Asia/Dhaka",

    defaultLanguage:
      "en",

    businessHoursEnabled:
      true,

    businessStart:
      "09:00",

    businessEnd:
      "18:00",
  },

  tickets: {
    defaultPriority:
      "Normal",

    autoCloseResolvedHours:
      72,

    allowReopen:
      true,

    ticketPrefix:
      "SUP",
  },

  assignment: {
    autoAssignment:
      true,

    strategy:
      "round_robin",

    maxOpenTicketsPerAgent:
      25,

    fallbackToUnassigned:
      true,
  },

  sla: {
    urgent: {
      firstResponseMinutes:
        10,

      resolutionMinutes:
        60,
    },

    high: {
      firstResponseMinutes:
        30,

      resolutionMinutes:
        240,
    },

    normal: {
      firstResponseMinutes:
        120,

      resolutionMinutes:
        1440,
    },

    low: {
      firstResponseMinutes:
        240,

      resolutionMinutes:
        2880,
    },

    warningBeforeMinutes:
      15,

    autoEscalateOnBreach:
      true,
  },

  escalation: {
    enabled:
      true,

    unresolvedAfterMinutes:
      240,

    slaBreachEscalation:
      true,

    notifyAdmin:
      true,
  },

  notifications: {
    newTicket:
      true,

    assignment:
      true,

    slaWarning:
      true,

    escalation:
      true,

    sound:
      false,
  },

  aiCopilot: {
    enabled:
      true,

    responseSuggestions:
      true,

    summarizeConversations:
      true,

    confidenceThreshold:
      70,

    requireHumanApproval:
      true,
  },

  knowledgeBase: {
    suggestionsEnabled:
      true,

    internalArticles:
      true,

    publicArticles:
      true,
  },

  savedReplies: {
    sharedEnabled:
      true,

    allowAgentCreate:
      true,

    approvalRequired:
      true,
  },

  security: {
    maskSensitiveData:
      true,

    auditAgentActions:
      true,

    requireReauthForSensitiveViews:
      true,
  },

  appearance: {
    density:
      "comfortable",

    animations:
      true,

    compactSidebar:
      false,
  },
};

/* =========================================================
   GET / CREATE SETTINGS
========================================================= */

export async function getOrCreateSupportSettings(
  session?:
    ClientSession
) {
  const query =
    SupportSettings.findOne({
      key:
        "support",
    });

  if (
    session
  ) {
    query.session(
      session
    );
  }

  const existing =
    await query;

  if (
    existing
  ) {
    return existing;
  }

  try {
    const documents =
      await SupportSettings.create(
        [
          {
            key:
              "support",

            ...SUPPORT_SETTINGS_DEFAULTS,

            revision:
              1,
          },
        ],

        session
          ? {
              session,
            }
          : undefined
      );

    const created =
      documents[0];

    if (
      !created
    ) {
      throw new Error(
        "Unable to create support settings."
      );
    }

    return created;
  } catch (
    error:
      unknown
  ) {
    /*
     * Another request may have created the singleton
     * between findOne() and create().
     */
    if (
      typeof error ===
        "object" &&
      error !==
        null &&
      "code" in
        error &&
      (
        error as {
          code?:
            number;
        }
      ).code ===
        11000
    ) {
      const retry =
        SupportSettings.findOne({
          key:
            "support",
        });

      if (
        session
      ) {
        retry.session(
          session
        );
      }

      const winner =
        await retry;

      if (
        winner
      ) {
        return winner;
      }
    }

    throw error;
  }
}

/* =========================================================
   NORMALIZE OBJECT
========================================================= */

function plainSection<
  T,
>(
  value:
    T
): T {
  /*
   * Safely strips mongoose subdocument metadata.
   */
  return JSON.parse(
    JSON.stringify(
      value
    )
  ) as T;
}

/* =========================================================
   SETTINGS DTO
========================================================= */

export function supportSettingsToDTO(
  settings:
    {
      general:
        SupportSettingsPayload["general"];

      tickets:
        SupportSettingsPayload["tickets"];

      assignment:
        SupportSettingsPayload["assignment"];

      sla:
        SupportSettingsPayload["sla"];

      escalation:
        SupportSettingsPayload["escalation"];

      notifications:
        SupportSettingsPayload["notifications"];

      aiCopilot:
        SupportSettingsPayload["aiCopilot"];

      knowledgeBase:
        SupportSettingsPayload["knowledgeBase"];

      savedReplies:
        SupportSettingsPayload["savedReplies"];

      security:
        SupportSettingsPayload["security"];

      appearance:
        SupportSettingsPayload["appearance"];
    }
): SupportSettingsPayload {
  return {
    general:
      plainSection(
        settings.general
      ),

    tickets:
      plainSection(
        settings.tickets
      ),

    assignment:
      plainSection(
        settings.assignment
      ),

    sla:
      plainSection(
        settings.sla
      ),

    escalation:
      plainSection(
        settings.escalation
      ),

    notifications:
      plainSection(
        settings.notifications
      ),

    aiCopilot:
      plainSection(
        settings.aiCopilot
      ),

    knowledgeBase:
      plainSection(
        settings.knowledgeBase
      ),

    savedReplies:
      plainSection(
        settings.savedReplies
      ),

    security:
      plainSection(
        settings.security
      ),

    appearance:
      plainSection(
        settings.appearance
      ),
  };
}

/* =========================================================
   UPDATE ONE SECTION ATOMICALLY
========================================================= */

export async function updateSupportSettingsSectionAtomically(
  {
    section,
    value,
    revision,
    userId,
    session,
  }: {
    section:
      SupportSettingsSection;

    value:
      SupportSettingsPayload[
        SupportSettingsSection
      ];

    revision:
      number;

    userId:
      string;

    session?:
      ClientSession;
  }
) {
  if (
    !mongoose.Types
      .ObjectId
      .isValid(
        userId
      )
  ) {
    throw new Error(
      "INVALID_SUPPORT_SETTINGS_USER"
    );
  }

  const updatePath =
    section;

  const query = {
    key:
      "support",

    revision,
  };

  const update = {
    $set: {
      [updatePath]:
        plainSection(
          value
        ),

      updatedBy:
        new mongoose.Types.ObjectId(
          userId
        ),
    },

    $inc: {
      revision:
        1,
    },
  };

  const options = {
    new:
      true,

    runValidators:
      true,

    ...(session
      ? {
          session,
        }
      : {}),
  };

  return SupportSettings.findOneAndUpdate(
    query,
    update,
    options
  );
}

/* =========================================================
   CHANGED FIELD DETECTION
========================================================= */

export function getChangedSectionFields(
  section:
    SupportSettingsSection,

  before:
    unknown,

  after:
    unknown
): string[] {
  const changed:
    string[] = [];

  function isPlainObject(
    value:
      unknown
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value
      ) &&
      !(
        value instanceof
        Date
      )
    );
  }

  function walk(
    left:
      unknown,

    right:
      unknown,

    path:
      string
  ) {
    if (
      isPlainObject(
        left
      ) &&
      isPlainObject(
        right
      )
    ) {
      const keys =
        new Set([
          ...Object.keys(
            left
          ),

          ...Object.keys(
            right
          ),
        ]);

      for (
        const key of
        keys
      ) {
        walk(
          left[
            key
          ],

          right[
            key
          ],

          `${path}.${key}`
        );
      }

      return;
    }

    if (
      Array.isArray(
        left
      ) ||
      Array.isArray(
        right
      )
    ) {
      if (
        JSON.stringify(
          left
        ) !==
        JSON.stringify(
          right
        )
      ) {
        changed.push(
          path
        );
      }

      return;
    }

    if (
      left instanceof
        Date ||
      right instanceof
        Date
    ) {
      const leftValue =
        left instanceof
          Date
          ? left.toISOString()
          : left;

      const rightValue =
        right instanceof
          Date
          ? right.toISOString()
          : right;

      if (
        leftValue !==
        rightValue
      ) {
        changed.push(
          path
        );
      }

      return;
    }

    if (
      left !==
      right
    ) {
      changed.push(
        path
      );
    }
  }

  walk(
    before,
    after,
    section
  );

  return Array.from(
    new Set(
      changed
    )
  );
}