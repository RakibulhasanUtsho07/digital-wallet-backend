import mongoose from "mongoose";

import {
  AiSupportAlert,
} from "../../../models/AiSupportAlert.js";
import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportIncident,
} from "../../../models/AiSupportIncident.js";
import {
  AiSupportKnowledgeDraft,
} from "../../../models/AiSupportKnowledgeDraft.js";
import {
  loadCofferAiConfig,
} from "../config/cofferAiConfig.js";
import {
  getSupportAlertMonitorStatus,
} from "../monitoring/supportAlertMonitor.js";
import {
  getSupportMaintenanceMonitorStatus,
} from "../monitoring/supportMaintenanceMonitor.js";

export async function getSupportAiHealth() {
  const config =
    loadCofferAiConfig();

  const [
    openCases,
    activeAlerts,
    activeIncidents,
    submittedDrafts,
  ] =
    await Promise.all([
      AiSupportCase.countDocuments({
        status: {
          $in: [
            "open",
            "investigating",
            "waiting_customer",
            "escalated",
          ],
        },
      }),

      AiSupportAlert.countDocuments({
        status: {
          $in: [
            "open",
            "acknowledged",
          ],
        },
      }),

      AiSupportIncident.countDocuments({
        status: {
          $nin: [
            "resolved",
            "closed",
          ],
        },
      }),

      AiSupportKnowledgeDraft.countDocuments({
        status:
          "submitted",
      }),
    ]);

  const mongoReady =
    mongoose.connection.readyState ===
    1;

  return {
    generatedAt:
      new Date().toISOString(),

    status:
      mongoReady &&
      config.enabled
        ? "ready"
        : "degraded",

    database: {
      mongoReady,
      readyState:
        mongoose.connection.readyState,
    },

    ai: {
      enabled:
        config.enabled,
      provider:
        config.provider,
      modelEnabled:
        config.modelEnabled,
      knowledgeEnabled:
        config.knowledgeEnabled,
      paidApiRequired:
        config.provider ===
        "openai",
    },

    monitors: {
      proactiveAlerts:
        getSupportAlertMonitorStatus(),
      maintenance:
        getSupportMaintenanceMonitorStatus(),
    },

    workspace: {
      openCases,
      activeAlerts,
      activeIncidents,
      submittedKnowledgeDrafts:
        submittedDrafts,
    },

    security: {
      financialMutation:
        false,
      supportRoleRequired:
        true,
      adminApprovalRequiredForKnowledgePublish:
        true,
    },
  };
}
