import mongoose, {
  Document,
  Schema,
} from "mongoose";
import { RevenueEventKind } from "../types/revenue";



export interface IRevenueEvent
  extends Document {
  userId?:
    mongoose.Types.ObjectId;

  idempotencyKey:
    string;

  kind:
    RevenueEventKind;

  feeMinor:
    number;

  volumeMinor:
    number;

  sourceReference?:
    string;

  occurredAt:
    Date;

  metadata:
    Record<
      string,
      string | number | boolean
    >;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const revenueEventSchema =
  new Schema<IRevenueEvent>(
    {
      userId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        index:
          true,
      },

      idempotencyKey: {
        type:
          String,

        required:
          true,

        unique:
          true,

        trim:
          true,

        maxlength:
          180,
      },

      kind: {
        type:
          String,

        enum: [
          "TRANSFER_FEE",
          "WITHDRAWAL_FEE",
          "DEPOSIT_FEE",
          "SERVICE_FEE",
          "MERCHANT_FEE",
          "REFUND",
          "FEE_WAIVER",
          "GATEWAY_REVERSAL",
          "MICRO_FEE_ADJUSTMENT",
        ],

        required:
          true,

        index:
          true,
      },

      /*
       * Integer minor units (poisha).
       * Example: ৳10.00 => 1000.
       */
      feeMinor: {
        type:
          Number,

        required:
          true,

        min:
          0,

        validate: {
          validator:
            Number.isSafeInteger,

          message:
            "feeMinor must be a safe integer.",
        },
      },

      volumeMinor: {
        type:
          Number,

        default:
          0,

        min:
          0,

        validate: {
          validator:
            Number.isSafeInteger,

          message:
            "volumeMinor must be a safe integer.",
        },
      },

      sourceReference: {
        type:
          String,

        trim:
          true,

        maxlength:
          180,

        index:
          true,
      },

      occurredAt: {
        type:
          Date,

        default:
          Date.now,

        index:
          true,
      },

      metadata: {
        type:
          Schema.Types.Mixed,

        default:
          {},
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    }
  );

revenueEventSchema.index({
  kind:
    1,
  occurredAt:
    -1,
});

revenueEventSchema.index({
  userId:
    1,
  occurredAt:
    -1,
});

export const RevenueEvent =
  mongoose.models.RevenueEvent ||
  mongoose.model<IRevenueEvent>(
    "RevenueEvent",
    revenueEventSchema
  );

export default RevenueEvent;
