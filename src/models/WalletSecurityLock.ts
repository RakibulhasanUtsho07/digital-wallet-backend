import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IWalletSecurityLock
  extends Document {
  userId: mongoose.Types.ObjectId;
  frozen: boolean;
  reason?: string;
  frozenAt?: Date;
  unfrozenAt?: Date;
  updatedBySessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const walletSecurityLockSchema =
  new Schema<IWalletSecurityLock>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      frozen: {
        type: Boolean,
        default: false,
        index: true,
      },

      reason: {
        type: String,
        maxlength: 240,
      },

      frozenAt: {
        type: Date,
      },

      unfrozenAt: {
        type: Date,
      },

      updatedBySessionId: {
        type: String,
        maxlength: 100,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

export const WalletSecurityLock =
  mongoose.models.WalletSecurityLock ||
  mongoose.model<IWalletSecurityLock>(
    "WalletSecurityLock",
    walletSecurityLockSchema
  );

export default WalletSecurityLock;
