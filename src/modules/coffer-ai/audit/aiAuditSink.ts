import AiAuditLog from "../../../models/AiAuditLog.js";
import type {
  AiAuditEvent,
  AiAuditSink,
} from "../types/cofferAi.types.js";



export interface SafeAuditLogger {
  info(event: AiAuditEvent): void;
}

/**
 * Emits only the already-redacted audit contract. Message text, tool payloads,
 * payment evidence, tokens, and secrets are intentionally absent.
 */
export function createRedactedLoggerAuditSink(
  logger: SafeAuditLogger,
): AiAuditSink {
  return {
    write(event) {
      logger.info(event);
    },
  };
}

export const noopAiAuditSink: AiAuditSink = {
  write() {
    // Intended for tests only. Configure a persistent sink in production.
  },
};

export function createMongoAiAuditSink(input?: {
  error?(message: string, error: unknown): void;
}): AiAuditSink {
  return {
    async write(event) {
      try {
        await AiAuditLog.create({
          eventType:
            event.eventType,
          requestId:
            event.requestId,
          actorType:
            event.actorType,
          actorRef:
            event.actorRef ?? undefined,
          intent:
            event.intent,
          toolId:
            event.toolId,
          reasonCode:
            event.reasonCode,
          metadata:
            event.metadata ?? {},
          eventCreatedAt:
            new Date(event.createdAt),
        });
      } catch (error) {
        input?.error?.(
          "COFFER_AI_AUDIT_PERSISTENCE_ERROR",
          error,
        );
      }
    },
  };
}

export function createCompositeAiAuditSink(
  sinks: ReadonlyArray<AiAuditSink>,
): AiAuditSink {
  return {
    async write(event) {
      for (const sink of sinks) {
        await sink.write(event);
      }
    },
  };
}
