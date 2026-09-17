import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IEncryptedCashFlowValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface ICashFlowPlan
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  titleEncrypted:
    IEncryptedCashFlowValue;

  amountEncrypted:
    IEncryptedCashFlowValue;

  categoryEncrypted:
    IEncryptedCashFlowValue;

  type:
    | "INCOME"
    | "EXPENSE";

  date:
    Date;

  isRecurring:
    boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

const encryptedValueSchema =
  new Schema<IEncryptedCashFlowValue>(
    {
      encrypted: {
        type: String,
        required: true,
      },

      iv: {
        type: String,
        required: true,
      },

      authTag: {
        type: String,
        required: true,
      },
    },
    {
      _id: false,
    }
  );

const cashFlowPlanSchema =
  new Schema<ICashFlowPlan>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      titleEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      amountEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      categoryEncrypted: {
        type:
          encryptedValueSchema,
        required: true,
      },

      type: {
        type: String,
        enum: [
          "INCOME",
          "EXPENSE",
        ],
        required: true,
      },

      date: {
        type: Date,
        required: true,
        index: true,
      },

      isRecurring: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    }
  );

cashFlowPlanSchema.index(
  {
    userId: 1,
    date: 1,
  }
);

export const CashFlowPlan =
  mongoose.models
    .CashFlowPlan ||
  mongoose.model<ICashFlowPlan>(
    "CashFlowPlan",
    cashFlowPlanSchema
  );

export default CashFlowPlan;
