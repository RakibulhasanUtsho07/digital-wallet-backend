import mongoose, {
  Document,
  Schema,
} from "mongoose";
import { AssignmentStrategy, SupportDensity, SupportPriority } from "../services/supportSettingsTypes";



export interface ISupportSettings
  extends Document {
  key:
    "support";

  general: {
    workspaceName:
      string;

    timezone:
      string;

    defaultLanguage:
      string;

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
    urgent: {
      firstResponseMinutes:
        number;

      resolutionMinutes:
        number;
    };

    high: {
      firstResponseMinutes:
        number;

      resolutionMinutes:
        number;
    };

    normal: {
      firstResponseMinutes:
        number;

      resolutionMinutes:
        number;
    };

    low: {
      firstResponseMinutes:
        number;

      resolutionMinutes:
        number;
    };

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

  revision:
    number;

  updatedBy?:
    mongoose.Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const supportSettingsSchema =
  new Schema<ISupportSettings>(
    {
      key: {
        type:
          String,

        enum: [
          "support",
        ],

        default:
          "support",

        unique:
          true,

        immutable:
          true,

        required:
          true,
      },

      general: {
        workspaceName: {
          type:
            String,

          trim:
            true,

          default:
            "Coffer Support",

          minlength:
            2,

          maxlength:
            80,

          required:
            true,
        },

        timezone: {
          type:
            String,

          trim:
            true,

          default:
            "Asia/Dhaka",

          maxlength:
            80,

          required:
            true,
        },

        defaultLanguage: {
          type:
            String,

          enum: [
            "en",
            "bn",
          ],

          default:
            "en",

          required:
            true,
        },

        businessHoursEnabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        businessStart: {
          type:
            String,

          default:
            "09:00",

          required:
            true,
        },

        businessEnd: {
          type:
            String,

          default:
            "18:00",

          required:
            true,
        },
      },

      tickets: {
        defaultPriority: {
          type:
            String,

          enum: [
            "Urgent",
            "High",
            "Normal",
            "Low",
          ],

          default:
            "Normal",

          required:
            true,
        },

        autoCloseResolvedHours: {
          type:
            Number,

          min:
            1,

          max:
            720,

          default:
            72,

          required:
            true,
        },

        allowReopen: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        ticketPrefix: {
          type:
            String,

          trim:
            true,

          uppercase:
            true,

          default:
            "SUP",

          minlength:
            2,

          maxlength:
            8,

          required:
            true,
        },
      },

      assignment: {
        autoAssignment: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        strategy: {
          type:
            String,

          enum: [
            "round_robin",
            "least_open",
            "manual",
          ],

          default:
            "round_robin",

          required:
            true,
        },

        maxOpenTicketsPerAgent: {
          type:
            Number,

          min:
            1,

          max:
            200,

          default:
            25,

          required:
            true,
        },

        fallbackToUnassigned: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      sla: {
        urgent: {
          firstResponseMinutes: {
            type:
              Number,

            default:
              10,

            min:
              1,

            max:
              10080,

            required:
              true,
          },

          resolutionMinutes: {
            type:
              Number,

            default:
              60,

            min:
              1,

            max:
              43200,

            required:
              true,
          },
        },

        high: {
          firstResponseMinutes: {
            type:
              Number,

            default:
              30,

            min:
              1,

            max:
              10080,

            required:
              true,
          },

          resolutionMinutes: {
            type:
              Number,

            default:
              240,

            min:
              1,

            max:
              43200,

            required:
              true,
          },
        },

        normal: {
          firstResponseMinutes: {
            type:
              Number,

            default:
              120,

            min:
              1,

            max:
              10080,

            required:
              true,
          },

          resolutionMinutes: {
            type:
              Number,

            default:
              1440,

            min:
              1,

            max:
              43200,

            required:
              true,
          },
        },

        low: {
          firstResponseMinutes: {
            type:
              Number,

            default:
              240,

            min:
              1,

            max:
              10080,

            required:
              true,
          },

          resolutionMinutes: {
            type:
              Number,

            default:
              2880,

            min:
              1,

            max:
              43200,

            required:
              true,
          },
        },

        warningBeforeMinutes: {
          type:
            Number,

          default:
            15,

          min:
            1,

          max:
            1440,

          required:
            true,
        },

        autoEscalateOnBreach: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      escalation: {
        enabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        unresolvedAfterMinutes: {
          type:
            Number,

          default:
            240,

          min:
            15,

          max:
            43200,

          required:
            true,
        },

        slaBreachEscalation: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        notifyAdmin: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      notifications: {
        newTicket: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        assignment: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        slaWarning: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        escalation: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        sound: {
          type:
            Boolean,

          default:
            false,

          required:
            true,
        },
      },

      aiCopilot: {
        enabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        responseSuggestions: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        summarizeConversations: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        confidenceThreshold: {
          type:
            Number,

          default:
            70,

          min:
            50,

          max:
            99,

          required:
            true,
        },

        requireHumanApproval: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      knowledgeBase: {
        suggestionsEnabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        internalArticles: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        publicArticles: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      savedReplies: {
        sharedEnabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        allowAgentCreate: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        approvalRequired: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      security: {
        maskSensitiveData: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        auditAgentActions: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        requireReauthForSensitiveViews: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      appearance: {
        density: {
          type:
            String,

          enum: [
            "comfortable",
            "compact",
          ],

          default:
            "comfortable",

          required:
            true,
        },

        animations: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        compactSidebar: {
          type:
            Boolean,

          default:
            false,

          required:
            true,
        },
      },

      revision: {
        type:
          Number,

        default:
          1,

        min:
          1,

        required:
          true,
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",
      },
    },
    {
      timestamps:
        true,

      minimize:
        false,

      versionKey:
        false,
    }
  );

supportSettingsSchema.index(
  {
    key:
      1,
  },
  {
    unique:
      true,
  }
);

export const SupportSettings =
  mongoose.models
    .SupportSettings ||
  mongoose.model<ISupportSettings>(
    "SupportSettings",
    supportSettingsSchema
  );




