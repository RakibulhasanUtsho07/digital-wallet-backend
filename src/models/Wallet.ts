import mongoose, {
  Schema,
  Document,
} from "mongoose";

export interface IWallet
  extends Document {
  userId: mongoose.Types.ObjectId;

  balance: number;

  pendingBalance: number;

  currency: string;

  status:
    | "ACTIVE"
    | "FROZEN"
    | "BLOCKED";

  createdAt: Date;

  updatedAt: Date;
}

const walletSchema =
  new Schema<IWallet>(
    {
      userId: {
        type:
          Schema.Types.ObjectId,

        ref: "User",

        required: true,

        unique: true,

        index: true,
      },

      balance: {
        type: Number,

        required: true,

        default: 0,

        min: 0,
      },

      pendingBalance: {
        type: Number,

        required: true,

        default: 0,

        min: 0,
      },

      currency: {
        type: String,

        required: true,

        enum: [
          "BDT",
          "USD",
          "EUR",
        ],

        default: "BDT",
      },

      status: {
        type: String,

        enum: [
          "ACTIVE",
          "FROZEN",
          "BLOCKED",
        ],

        default: "ACTIVE",

        required: true,

        index: true,
      },
    },

    {
      timestamps: true,

      versionKey: false,
    }
  );

export const Wallet =
  mongoose.models.Wallet ||
  mongoose.model<IWallet>(
    "Wallet",
    walletSchema
  );

export default Wallet;