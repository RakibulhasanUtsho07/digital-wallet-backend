import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IAnalyticsDailyFact
  extends Document {
  dateKey:
    string;

  transaction: {
    volumeMinor:
      number;
    count:
      number;
    failedCount:
      number;
    averageValueMinor:
      number;
  };

  revenue: {
    platformRevenueMinor:
      number;
    merchantRevenueMinor:
      number;
    transferRevenueMinor:
      number;
    withdrawalRevenueMinor:
      number;
  };

  users: {
    activeUsers:
      number;
    newUsers:
      number;
    retainedUsers:
      number;
    kycCompletedUsers:
      number;
    totalEligibleUsers:
      number;
  };

  wallet: {
    aggregateBalanceMinor:
      number;
  };

  channels: {
    transferCount:
      number;
    merchantCount:
      number;
    cashInCount:
      number;
    cashOutCount:
      number;
  };

  failures: {
    gatewayTimeout:
      number;
    insufficientFunds:
      number;
    riskBlocked:
      number;
    bankRejected:
      number;
    other:
      number;
  };

  risk: {
    lowCount:
      number;
    monitoredCount:
      number;
    highCount:
      number;
    criticalCount:
      number;

    lowExposureMinor:
      number;
    monitoredExposureMinor:
      number;
    highExposureMinor:
      number;
    criticalExposureMinor:
      number;
  };

  geography:
    Array<{
      region:
        string;
      transactionCount:
        number;
      volumeMinor:
        number;
    }>;

  generatedAt:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const analyticsDailyFactSchema =
  new Schema<IAnalyticsDailyFact>(
    {
      dateKey: {
        type:
          String,
        required:
          true,
        unique:
          true,
        trim:
          true,
      },

      transaction: {
        volumeMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        count: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        failedCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        averageValueMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      revenue: {
        platformRevenueMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        merchantRevenueMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        transferRevenueMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        withdrawalRevenueMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      users: {
        activeUsers: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        newUsers: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        retainedUsers: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        kycCompletedUsers: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        totalEligibleUsers: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      wallet: {
        aggregateBalanceMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      channels: {
        transferCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        merchantCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        cashInCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        cashOutCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      failures: {
        gatewayTimeout: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        insufficientFunds: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        riskBlocked: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        bankRejected: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        other: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      risk: {
        lowCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        monitoredCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        highCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        criticalCount: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },

        lowExposureMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        monitoredExposureMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        highExposureMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
        criticalExposureMinor: {
          type:
            Number,
          default:
            0,
          min:
            0,
        },
      },

      geography: {
        type: [
          {
            _id:
              false,
            region: {
              type:
                String,
              required:
                true,
              trim:
                true,
              maxlength:
                80,
            },
            transactionCount: {
              type:
                Number,
              default:
                0,
              min:
                0,
            },
            volumeMinor: {
              type:
                Number,
              default:
                0,
              min:
                0,
            },
          },
        ],
        default:
          [],
      },

      generatedAt: {
        type:
          Date,
        default:
          Date.now,
        index:
          true,
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

analyticsDailyFactSchema.index({
  dateKey:
    1,
  generatedAt:
    -1,
});

export const AnalyticsDailyFact =
  mongoose.models.AnalyticsDailyFact ||
  mongoose.model<IAnalyticsDailyFact>(
    "AnalyticsDailyFact",
    analyticsDailyFactSchema
  );

export default AnalyticsDailyFact;
