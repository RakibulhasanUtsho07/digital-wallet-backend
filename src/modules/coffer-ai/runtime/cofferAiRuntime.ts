import {
  createCompositeAiAuditSink,
  createMongoAiAuditSink,
  createRedactedLoggerAuditSink,
} from "../audit/aiAuditSink.js";
import { loadCofferAiConfig } from "../config/cofferAiConfig.js";
import { createAiChatController } from "../controllers/aiChatController.js";
import { createAiConversationController } from "../controllers/aiConversationController.js";
import { cofferMerchantPaymentReader } from "../integrations/cofferMerchantPaymentReader.js";
import { cofferOwnedPaymentReader } from "../integrations/cofferOwnedPaymentReader.js";
import { mongoAiKnowledgeService } from "../knowledge/aiKnowledgeService.js";
import { createAiConversationContextService } from "../memory/aiConversationContextService.js";
import { mongoAiConversationStore } from "../persistence/aiConversationStore.js";
import { createGroundedModelProvider } from "../providers/modelProviderFactory.js";
import { createAiChatService } from "../services/aiChatService.js";
import { createAiResponseComposer } from "../services/aiResponseComposer.js";
import { AiToolRegistry } from "../tools/aiToolRegistry.js";
import { adminPlatformOverviewTool } from "../tools/admin/adminPlatformOverviewTool.js";
import { adminRiskSnapshotTool, adminFinanceSnapshotTool } from "../tools/admin/adminFocusTools.js";
import { analystWalletSnapshotTool } from "../tools/analyst/analystWalletSnapshotTool.js";
import { analystPaymentSnapshotTool, analystRiskSnapshotTool, analystRevenueSnapshotTool } from "../tools/analyst/analystAggregateTools.js";
import { createGetOwnMerchantPaymentTimelineTool } from "../tools/merchant/getOwnMerchantPaymentTimelineTool.js";
import { merchantOverviewTool } from "../tools/merchant/merchantOverviewTool.js";
import { merchantRefundSummaryTool } from "../tools/merchant/merchantRefundSummaryTool.js";
import { merchantPayoutSummaryTool } from "../tools/merchant/merchantPayoutSummaryTool.js";
import { merchantSettlementSummaryTool } from "../tools/merchant/merchantSettlementSummaryTool.js";
import { merchantWebhookSummaryTool } from "../tools/merchant/merchantWebhookSummaryTool.js";
import { merchantApiKeySummaryTool } from "../tools/merchant/merchantApiKeySummaryTool.js";
import { merchantAnalyticsSummaryTool } from "../tools/merchant/merchantAnalyticsSummaryTool.js";
import { merchantRefundDiagnosisTool } from "../tools/merchant/merchantRefundDiagnosisTool.js";
import { merchantPayoutDiagnosisTool } from "../tools/merchant/merchantPayoutDiagnosisTool.js";
import { merchantSettlementDiagnosisTool } from "../tools/merchant/merchantSettlementDiagnosisTool.js";
import { merchantWebhookDiagnosisTool } from "../tools/merchant/merchantWebhookDiagnosisTool.js";
import { merchantApiKeyDiagnosisTool } from "../tools/merchant/merchantApiKeyDiagnosisTool.js";
import { supportInvestigationTool } from "../tools/support/supportInvestigationTool.js";
import { supportOperationsTool } from "../tools/support/supportOperationsTool.js";
import { createGetOwnPaymentTimelineTool } from "../tools/user/getOwnPaymentTimelineTool.js";
import { userKycStatusTool } from "../tools/user/userKycStatusTool.js";
import { userReceiptDetailTool } from "../tools/user/userReceiptDetailTool.js";
import { userSecuritySummaryTool } from "../tools/user/userSecuritySummaryTool.js";
import { userTransactionDetailTool } from "../tools/user/userTransactionDetailTool.js";
import { userWalletSummaryTool } from "../tools/user/userWalletSummaryTool.js";

const config = loadCofferAiConfig();

const toolRegistry = new AiToolRegistry();

[
  createGetOwnPaymentTimelineTool(cofferOwnedPaymentReader),
  userWalletSummaryTool,
  userKycStatusTool,
  userTransactionDetailTool,
  userReceiptDetailTool,
  userSecuritySummaryTool,
  createGetOwnMerchantPaymentTimelineTool(cofferMerchantPaymentReader),
  merchantOverviewTool,
  merchantRefundSummaryTool,
  merchantPayoutSummaryTool,
  merchantSettlementSummaryTool,
  merchantWebhookSummaryTool,
  merchantApiKeySummaryTool,
  merchantAnalyticsSummaryTool,
  merchantRefundDiagnosisTool,
  merchantPayoutDiagnosisTool,
  merchantSettlementDiagnosisTool,
  merchantWebhookDiagnosisTool,
  merchantApiKeyDiagnosisTool,
  supportInvestigationTool,
  supportOperationsTool,
  analystWalletSnapshotTool,
  analystPaymentSnapshotTool,
  analystRiskSnapshotTool,
  analystRevenueSnapshotTool,
  adminPlatformOverviewTool,
  adminRiskSnapshotTool,
  adminFinanceSnapshotTool,
].forEach((tool) => toolRegistry.register(tool));

const auditSink = createCompositeAiAuditSink([
  createRedactedLoggerAuditSink({
    info(event) {
      console.info("COFFER_AI_AUDIT", event);
    },
  }),
  createMongoAiAuditSink({
    error(message, error) {
      console.error(
        message,
        error instanceof Error ? error.message : error,
      );
    },
  }),
]);

const modelProvider =
  createGroundedModelProvider(
    config,
  );

const responseComposer = createAiResponseComposer({
  config,
  provider: modelProvider,
});

const conversationContextService =
  createAiConversationContextService(
    mongoAiConversationStore,
  );

const service = createAiChatService({
  config,
  toolRegistry,
  auditSink,
  responseComposer,
  conversationContextService,
  knowledgeService: mongoAiKnowledgeService,
  conversationStore: mongoAiConversationStore,
});

export const cofferAiChatController = createAiChatController({
  config,
  service,
}).chat;

const conversationController = createAiConversationController({
  config,
  conversationStore: mongoAiConversationStore,
});

export const cofferAiListConversationsController = conversationController.list;
export const cofferAiConversationMessagesController = conversationController.messages;
export const cofferAiFeedbackController = conversationController.feedback;
