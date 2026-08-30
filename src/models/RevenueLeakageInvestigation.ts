import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IRevenueLeakageInvestigation
  extends Document {
  category:
    string;

  range:
    string;

  status:
    | "investigating"
    | "resolved";

  note?:
    string;

  openedBy:
    mongoose.Types.ObjectId;

  resolvedBy?:
    mongoose.Types.ObjectId;

  resolvedAt?:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const revenueLeakageInvestigationSchema =
  new Schema<IRevenueLeakageInvestigation>(
    {
      category: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          120,

        index:
          true,
      },

      range: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          16,
      },

      status: {
        type:
          String,

        enum: [
          "investigating",
          "resolved",
        ],

        default:
          "investigating",

        index:
          true,
      },

      note: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,
      },

      openedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,
      },

      resolvedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",
      },

      resolvedAt: {
        type:
          Date,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        "throw",
    }
  );

revenueLeakageInvestigationSchema.index({
  category:
    1,
  status:
    1,
  createdAt:
    -1,
});

export const RevenueLeakageInvestigation =
  mongoose.models
    .RevenueLeakageInvestigation ||
  mongoose.model<IRevenueLeakageInvestigation>(
    "RevenueLeakageInvestigation",
    revenueLeakageInvestigationSchema
  );

export default RevenueLeakageInvestigation;
