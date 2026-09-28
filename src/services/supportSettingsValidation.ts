import {
  z,
} from "zod";

import type {
  SupportSettingsPayload,
  SupportSettingsSection,
} from "./supportSettingsTypes.js";

/* =========================================================
   SHARED
========================================================= */

const timeSchema =
  z
    .string()
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d$/,
      "Time must use HH:MM 24-hour format."
    );

const positiveInteger =
  (
    min:
      number,

    max:
      number
  ) =>
    z
      .number()
      .int()
      .min(
        min
      )
      .max(
        max
      );

/* =========================================================
   GENERAL
========================================================= */

const generalSchema =
  z
    .object({
      workspaceName:
        z
          .string()
          .trim()
          .min(
            2,
            "Workspace name is too short."
          )
          .max(
            80,
            "Workspace name is too long."
          ),

      timezone:
        z
          .string()
          .trim()
          .min(
            2
          )
          .max(
            80
          ),

      defaultLanguage:
        z.enum([
          "en",
          "bn",
        ]),

      businessHoursEnabled:
        z.boolean(),

      businessStart:
        timeSchema,

      businessEnd:
        timeSchema,
    })
    .strict();

/* =========================================================
   TICKETS
========================================================= */

const ticketsSchema =
  z
    .object({
      defaultPriority:
        z.enum([
          "Urgent",
          "High",
          "Normal",
          "Low",
        ]),

      autoCloseResolvedHours:
        positiveInteger(
          1,
          720
        ),

      allowReopen:
        z.boolean(),

      ticketPrefix:
        z
          .string()
          .trim()
          .regex(
            /^[A-Z0-9]{2,8}$/,
            "Ticket prefix must contain 2-8 uppercase letters or numbers."
          ),
    })
    .strict();

/* =========================================================
   ASSIGNMENT
========================================================= */

const assignmentSchema =
  z
    .object({
      autoAssignment:
        z.boolean(),

      strategy:
        z.enum([
          "round_robin",
          "least_open",
          "manual",
        ]),

      maxOpenTicketsPerAgent:
        positiveInteger(
          1,
          200
        ),

      fallbackToUnassigned:
        z.boolean(),
    })
    .strict();

/* =========================================================
   SLA
========================================================= */

const slaTargetSchema =
  z
    .object({
      firstResponseMinutes:
        positiveInteger(
          1,
          10080
        ),

      resolutionMinutes:
        positiveInteger(
          1,
          43200
        ),
    })
    .strict()
    .refine(
      (value) =>
        value
          .resolutionMinutes >=
        value
          .firstResponseMinutes,
      {
        message:
          "Resolution time cannot be shorter than first response time.",
      }
    );

const slaSchema =
  z
    .object({
      urgent:
        slaTargetSchema,

      high:
        slaTargetSchema,

      normal:
        slaTargetSchema,

      low:
        slaTargetSchema,

      warningBeforeMinutes:
        positiveInteger(
          1,
          1440
        ),

      autoEscalateOnBreach:
        z.boolean(),
    })
    .strict();

/* =========================================================
   ESCALATION
========================================================= */

const escalationSchema =
  z
    .object({
      enabled:
        z.boolean(),

      unresolvedAfterMinutes:
        positiveInteger(
          15,
          43200
        ),

      slaBreachEscalation:
        z.boolean(),

      notifyAdmin:
        z.boolean(),
    })
    .strict();

/* =========================================================
   NOTIFICATIONS
========================================================= */

const notificationsSchema =
  z
    .object({
      newTicket:
        z.boolean(),

      assignment:
        z.boolean(),

      slaWarning:
        z.boolean(),

      escalation:
        z.boolean(),

      sound:
        z.boolean(),
    })
    .strict();

/* =========================================================
   AI COPILOT
========================================================= */

const aiCopilotSchema =
  z
    .object({
      enabled:
        z.boolean(),

      responseSuggestions:
        z.boolean(),

      summarizeConversations:
        z.boolean(),

      confidenceThreshold:
        positiveInteger(
          50,
          99
        ),

      requireHumanApproval:
        z.boolean(),
    })
    .strict();

/* =========================================================
   KNOWLEDGE BASE
========================================================= */

const knowledgeBaseSchema =
  z
    .object({
      suggestionsEnabled:
        z.boolean(),

      internalArticles:
        z.boolean(),

      publicArticles:
        z.boolean(),
    })
    .strict();

/* =========================================================
   SAVED REPLIES
========================================================= */

const savedRepliesSchema =
  z
    .object({
      sharedEnabled:
        z.boolean(),

      allowAgentCreate:
        z.boolean(),

      approvalRequired:
        z.boolean(),
    })
    .strict();

/* =========================================================
   SECURITY
========================================================= */

const securitySchema =
  z
    .object({
      maskSensitiveData:
        z.boolean(),

      auditAgentActions:
        z.boolean(),

      requireReauthForSensitiveViews:
        z.boolean(),
    })
    .strict();

/* =========================================================
   APPEARANCE
========================================================= */

const appearanceSchema =
  z
    .object({
      density:
        z.enum([
          "comfortable",
          "compact",
        ]),

      animations:
        z.boolean(),

      compactSidebar:
        z.boolean(),
    })
    .strict();

/* =========================================================
   SECTION LIST
========================================================= */

export const SUPPORT_SETTINGS_SECTIONS =
  [
    "general",
    "tickets",
    "assignment",
    "sla",
    "escalation",
    "notifications",
    "aiCopilot",
    "knowledgeBase",
    "savedReplies",
    "security",
    "appearance",
  ] as const;

/* =========================================================
   SECTION CHECK
========================================================= */

export function isSupportSettingsSection(
  value:
    string
): value is SupportSettingsSection {
  return (
    SUPPORT_SETTINGS_SECTIONS as
      readonly string[]
  ).includes(
    value
  );
}

/* =========================================================
   SCHEMAS
========================================================= */

const schemas = {
  general:
    generalSchema,

  tickets:
    ticketsSchema,

  assignment:
    assignmentSchema,

  sla:
    slaSchema,

  escalation:
    escalationSchema,

  notifications:
    notificationsSchema,

  aiCopilot:
    aiCopilotSchema,

  knowledgeBase:
    knowledgeBaseSchema,

  savedReplies:
    savedRepliesSchema,

  security:
    securitySchema,

  appearance:
    appearanceSchema,
} as const;

/* =========================================================
   RESULT TYPE
========================================================= */

export type SupportSettingsValidationResult =
  | {
      ok:
        true;

      value:
        SupportSettingsPayload[
          SupportSettingsSection
        ];
    }
  | {
      ok:
        false;

      message:
        string;

      field?:
        string;
    };

/* =========================================================
   VALIDATE
========================================================= */

export function validateSupportSettingsSection(
  section:
    SupportSettingsSection,

  value:
    unknown
): SupportSettingsValidationResult {
  const schema =
    schemas[
      section
    ];

  const result =
    schema.safeParse(
      value
    );

  if (
    !result.success
  ) {
    const firstIssue =
      result.error
        .issues[0];

    const field =
      firstIssue
        ?.path
        ?.map(
          String
        )
        .join(
          "."
        );

    return {
      ok:
        false,

      message:
        firstIssue
          ?.message ||
        "Invalid support settings.",

      ...(field
        ? {
            field,
          }
        : {}),
    };
  }

  return {
    ok:
      true,

    value:
      result.data as
        SupportSettingsPayload[
          SupportSettingsSection
        ],
  };
}