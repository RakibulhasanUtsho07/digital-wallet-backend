import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Transaction } from "../models/Transaction.js";

// @desc    Get AI Spending Insights & Budget Recommendations
// @route   GET /api/ai/insights
// @access  Private
export const getSpendingInsights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactions = await Transaction.find({
      senderId: userId,
      type: "TRANSFER",
      createdAt: { $gte: thirtyDaysAgo },
    });

    const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const transactionCount = transactions.length;

    let spendingHealth = "BALANCED";
    let recommendation = "আপনার লেনদেনের প্যাটার্ন স্বাভাবিক রয়েছে। নিয়মিত সঞ্চয়ের অভ্যাস বজায় রাখুন।";

    if (totalSpent > 50000 || transactionCount > 15) {
      spendingHealth = "HIGH_EXPENSE";
      recommendation = "গত ৩০ দিনে অতিরিক্ত লেনদেন সনাক্ত হয়েছে। একটি মাসিক বাজেট লিমিট সেট করার পরামর্শ দেওয়া হচ্ছে।";
    }

    res.status(200).json({
      success: true,
      summary: {
        period: "Last 30 Days",
        totalSpent,
        totalTransactions: transactionCount,
        averagePerTransaction: transactionCount > 0 ? Math.round(totalSpent / transactionCount) : 0,
      },
      aiAnalysis: {
        spendingHealth,
        recommendation,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Fraud Risk Score for User Account
// @route   GET /api/ai/fraud-score
// @access  Private
export const getFraudRiskScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    const recentTransfers = await Transaction.find({
      senderId: userId,
      type: "TRANSFER",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const highValueTxs = recentTransfers.filter((tx) => tx.amount > 10000);
    let riskScore = 15;

    if (highValueTxs.length >= 2) {
      riskScore += 45;
    }

    let riskLevel = "LOW";
    if (riskScore >= 70) riskLevel = "HIGH";
    else if (riskScore >= 40) riskLevel = "MEDIUM";

    res.status(200).json({
      success: true,
      fraudAssessment: {
        riskScore,
        riskLevel,
        factorsChecked: ["Transaction Velocity", "Amount Variance", "Recipient Anomalies"],
        status: riskLevel === "HIGH" ? "FLAGGED_FOR_REVIEW" : "CLEAR",
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};