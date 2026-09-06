import mongoose, {
  Schema,
  type Document,
} from "mongoose";

export interface IEKYCAuditEvent
  extends Document {
  verificationId:
    mongoose.Types.ObjectId;

  sequence:
    number;

  eventType:
    string;

  actorType:
    | "USER"
    | "SYSTEM"
    | "ADMIN";

  actorIdHash?:
    string;

  correlationId:
    string;

  metadata:
    Record<
      string,
      unknown
    >;

  previousHash:
    string;

  eventHash:
    string;

  createdAt:
    Date;
}

const auditEventSchema =
  new Schema<IEKYCAuditEvent>(
    {
      verificationId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "EKYCVerification",

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      sequence: {
        type:
          Number,

        required:
          true,

        min:
          1,

        immutable:
          true,
      },

      eventType: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          100,

        immutable:
          true,
      },

      actorType: {
        type:
          String,

        enum: [
          "USER",
          "SYSTEM",
          "ADMIN",
        ],

        required:
          true,

        immutable:
          true,
      },

      actorIdHash: {
        type:
          String,

        maxlength:
          128,

        immutable:
          true,
      },

      correlationId: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          120,

        immutable:
          true,
      },

      metadata: {
        type:
          Schema.Types.Mixed,

        required:
          true,

        default:
          {},

        immutable:
          true,
      },

      previousHash: {
        type:
          String,

        required:
          true,

        minlength:
          64,

        maxlength:
          64,

        immutable:
          true,
      },

      eventHash: {
        type:
          String,

        required:
          true,

        minlength:
          64,

        maxlength:
          64,

        immutable:
          true,
      },

      createdAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,

        immutable:
          true,
      },
    },
    {
      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

auditEventSchema.index(
  {
    verificationId: 1,
    sequence: 1,
  },
  {
    unique: true,
    name:
      "uniq_ekyc_audit_sequence",
  }
);

auditEventSchema.index(
  {
    eventHash: 1,
  },
  {
    unique: true,
    name:
      "uniq_ekyc_audit_hash",
  }
);

auditEventSchema.index({
  correlationId: 1,
  createdAt: -1,
});

auditEventSchema.index({
  eventType: 1,
  createdAt: -1,
});

/* =========================================================
   APPLICATION-LEVEL IMMUTABILITY
========================================================= */

function blockAuditMutation():
  never {
  throw new Error(
    "e-KYC audit events are append-only and cannot be modified or deleted."
  );
}

auditEventSchema.pre(
  "updateOne",
  blockAuditMutation
);

auditEventSchema.pre(
  "updateMany",
  blockAuditMutation
);

auditEventSchema.pre(
  "replaceOne",
  blockAuditMutation
);

auditEventSchema.pre(
  "findOneAndUpdate",
  blockAuditMutation
);

auditEventSchema.pre(
  "findOneAndReplace",
  blockAuditMutation
);

auditEventSchema.pre(
  "deleteOne",
  blockAuditMutation
);

auditEventSchema.pre(
  "deleteMany",
  blockAuditMutation
);

auditEventSchema.pre(
  "findOneAndDelete",
  blockAuditMutation
);

export const EKYCAuditEvent:
  mongoose.Model<IEKYCAuditEvent> =
  (
    mongoose.models
      .EKYCAuditEvent as
      | mongoose.Model<IEKYCAuditEvent>
      | undefined
  ) ??
  mongoose.model<IEKYCAuditEvent>(
    "EKYCAuditEvent",
    auditEventSchema
  );

export default EKYCAuditEvent;