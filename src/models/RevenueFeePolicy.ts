import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IRevenueFeePolicy
  extends Document {
  key:
    "global";

  transferFeeMinor:
    number;

  withdrawalFeeMinor:
    number;

  monthlyTxnEstimate:
    number;

  transferShareBps:
    number;

  withdrawalShareBps:
    number;

  elasticityBpsPer200Minor:
    number;

  revision:
    number;

  updatedBy?:
    mongoose.Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const integerValidator = {
  validator:
    Number.isSafeInteger,

  message:
    "Value must be a safe integer.",
};

const revenueFeePolicySchema =
  new Schema<IRevenueFeePolicy>(
    {
      key: {
        type:
          String,

        enum: [
          "global",
        ],

        default:
          "global",

        unique:
          true,

        immutable:
          true,
      },

      transferFeeMinor: {
        type:
          Number,

        default:
          1000,

        min:
          0,

        max:
          2500,

        validate:
          integerValidator,
      },

      withdrawalFeeMinor: {
        type:
          Number,

        default:
          1800,

        min:
          500,

        max:
          4000,

        validate:
          integerValidator,
      },

      monthlyTxnEstimate: {
        type:
          Number,

        default:
          150000,

        min:
          50000,

        max:
          300000,

        validate:
          integerValidator,
      },

      transferShareBps: {
        type:
          Number,

        default:
          6000,

        min:
          0,

        max:
          10000,

        validate:
          integerValidator,
      },

      withdrawalShareBps: {
        type:
          Number,

        default:
          4000,

        min:
          0,

        max:
          10000,

        validate:
          integerValidator,
      },

      /*
       * 120 bps = 1.2% volume dampening for each
       * additional ৳2.00 increase above the current fee.
       */
      elasticityBpsPer200Minor: {
        type:
          Number,

        default:
          120,

        min:
          0,

        max:
          2500,

        validate:
          integerValidator,
      },

      revision: {
        type:
          Number,

        default:
          1,

        min:
          1,
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

      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    }
  );

revenueFeePolicySchema.pre(
  "validate",
  function () {
    if (
      this.transferShareBps +
        this.withdrawalShareBps !==
      10000
    ) {
      throw new Error(
        "Transfer and withdrawal shares must total 10000 basis points."
      );
    }
  }
);

export const RevenueFeePolicy =
  mongoose.models.RevenueFeePolicy ||
  mongoose.model<IRevenueFeePolicy>(
    "RevenueFeePolicy",
    revenueFeePolicySchema
  );

export default RevenueFeePolicy;
