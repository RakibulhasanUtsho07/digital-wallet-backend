import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   CATEGORY BUDGET
   One category limit per user/month/year.
========================================================= */

export interface IBudget
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  category:
    string;

  iconName:
    string;

  limitAmount:
    number;

  /*
   * Kept for backward compatibility with existing records.
   * The new budgeting dashboard calculates spending from
   * BudgetExpense records instead of trusting this counter.
   */
  spentAmount:
    number;

  month:
    number;

  year:
    number;
}

const budgetSchema =
  new Schema<IBudget>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
      },

      iconName: {
        type: String,
        default:
          "MoreHorizontal",
        trim: true,
        maxlength: 40,
      },

      limitAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      spentAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },

      year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
      },
    },
    {
      timestamps: true,
    }
  );

budgetSchema.index(
  {
    userId: 1,
    category: 1,
    month: 1,
    year: 1,
  },
  {
    unique: true,
  }
);

/* =========================================================
   MONTHLY SETTINGS
========================================================= */

export interface IBudgetSettings
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  month:
    number;

  year:
    number;

  totalLimit:
    number;
}

const budgetSettingsSchema =
  new Schema<IBudgetSettings>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },

      year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
      },

      totalLimit: {
        type: Number,
        required: true,
        min: 1,
        default: 30000,
      },
    },
    {
      timestamps: true,
    }
  );

budgetSettingsSchema.index(
  {
    userId: 1,
    month: 1,
    year: 1,
  },
  {
    unique: true,
  }
);

/* =========================================================
   SAVINGS PROFILE
   Savings are user-level, not reset every month.
========================================================= */

export interface IBudgetSavings
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  savingsGoal:
    number;

  currentSavings:
    number;
}

const budgetSavingsSchema =
  new Schema<IBudgetSavings>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      savingsGoal: {
        type: Number,
        required: true,
        min: 1,
        default: 100000,
      },

      currentSavings: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
    },
    {
      timestamps: true,
    }
  );

/* =========================================================
   MANUAL BUDGET EXPENSE
   This is budgeting metadata, not the wallet ledger.
========================================================= */

export interface IBudgetExpense
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  categoryId:
    mongoose.Types.ObjectId;

  title:
    string;

  amount:
    number;

  method:
    string;

  date:
    Date;

  month:
    number;

  year:
    number;
}

const budgetExpenseSchema =
  new Schema<IBudgetExpense>(
    {
      userId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      categoryId: {
        type:
          Schema.Types
            .ObjectId,
        ref: "Budget",
        required: true,
        index: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      amount: {
        type: Number,
        required: true,
        min: 0.01,
      },

      method: {
        type: String,
        trim: true,
        maxlength: 60,
        default:
          "Manual Entry",
      },

      date: {
        type: Date,
        required: true,
        default: Date.now,
      },

      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },

      year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
      },
    },
    {
      timestamps: true,
    }
  );

budgetExpenseSchema.index(
  {
    userId: 1,
    month: 1,
    year: 1,
    date: -1,
  }
);

/* =========================================================
   MODELS
========================================================= */

export const Budget =
  mongoose.models.Budget ||
  mongoose.model<IBudget>(
    "Budget",
    budgetSchema
  );

export const BudgetSettings =
  mongoose.models
    .BudgetSettings ||
  mongoose.model<IBudgetSettings>(
    "BudgetSettings",
    budgetSettingsSchema
  );

export const BudgetSavings =
  mongoose.models
    .BudgetSavings ||
  mongoose.model<IBudgetSavings>(
    "BudgetSavings",
    budgetSavingsSchema
  );

export const BudgetExpense =
  mongoose.models
    .BudgetExpense ||
  mongoose.model<IBudgetExpense>(
    "BudgetExpense",
    budgetExpenseSchema
  );

export default Budget;
