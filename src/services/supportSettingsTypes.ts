/* =========================================================
   SETTINGS SECTIONS
========================================================= */

export type SupportSettingsSection =
  | "general"
  | "tickets"
  | "assignment"
  | "sla"
  | "escalation"
  | "notifications"
  | "aiCopilot"
  | "knowledgeBase"
  | "savedReplies"
  | "security"
  | "appearance";

/* =========================================================
   SHARED TYPES
========================================================= */

export type SupportPriority =
  | "Urgent"
  | "High"
  | "Normal"
  | "Low";

export type AssignmentStrategy =
  | "round_robin"
  | "least_open"
  | "manual";

export type SupportDensity =
  | "comfortable"
  | "compact";

export type SupportLanguage =
  | "en"
  | "bn";

/* =========================================================
   SLA TARGET
========================================================= */

export interface SupportSlaTarget {
  firstResponseMinutes:
    number;

  resolutionMinutes:
    number;
}

/* =========================================================
   MAIN SETTINGS PAYLOAD
========================================================= */

export interface SupportSettingsPayload {
  general: {
    workspaceName:
      string;

    timezone:
      string;

    defaultLanguage:
      SupportLanguage;

    businessHoursEnabled:
      boolean;

    businessStart:
      string;

    businessEnd:
      string;
  };

  tickets: {
    defaultPriority:
      SupportPriority;

    autoCloseResolvedHours:
      number;

    allowReopen:
      boolean;

    ticketPrefix:
      string;
  };

  assignment: {
    autoAssignment:
      boolean;

    strategy:
      AssignmentStrategy;

    maxOpenTicketsPerAgent:
      number;

    fallbackToUnassigned:
      boolean;
  };

  sla: {
    urgent:
      SupportSlaTarget;

    high:
      SupportSlaTarget;

    normal:
      SupportSlaTarget;

    low:
      SupportSlaTarget;

    warningBeforeMinutes:
      number;

    autoEscalateOnBreach:
      boolean;
  };

  escalation: {
    enabled:
      boolean;

    unresolvedAfterMinutes:
      number;

    slaBreachEscalation:
      boolean;

    notifyAdmin:
      boolean;
  };

  notifications: {
    newTicket:
      boolean;

    assignment:
      boolean;

    slaWarning:
      boolean;

    escalation:
      boolean;

    sound:
      boolean;
  };

  aiCopilot: {
    enabled:
      boolean;

    responseSuggestions:
      boolean;

    summarizeConversations:
      boolean;

    confidenceThreshold:
      number;

    requireHumanApproval:
      boolean;
  };

  knowledgeBase: {
    suggestionsEnabled:
      boolean;

    internalArticles:
      boolean;

    publicArticles:
      boolean;
  };

  savedReplies: {
    sharedEnabled:
      boolean;

    allowAgentCreate:
      boolean;

    approvalRequired:
      boolean;
  };

  security: {
    maskSensitiveData:
      boolean;

    auditAgentActions:
      boolean;

    requireReauthForSensitiveViews:
      boolean;
  };

  appearance: {
    density:
      SupportDensity;

    animations:
      boolean;

    compactSidebar:
      boolean;
  };
}

/* =========================================================
   SECTION VALUE HELPER
========================================================= */

export type SupportSettingsSectionValue<
  K extends SupportSettingsSection,
> =
  SupportSettingsPayload[K];

/* =========================================================
   API META
========================================================= */

export interface SupportSettingsMeta {
  revision:
    number;

  updatedAt:
    string;
}

/* =========================================================
   AUDIT DTO
========================================================= */

export interface SupportSettingsAuditDTO {
  id:
    string;

  action:
    string;

  section:
    SupportSettingsSection;

  changedFields:
    string[];

  revision:
    number;

  occurredAt:
    string;
}