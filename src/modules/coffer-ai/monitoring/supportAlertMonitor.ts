import {
  evaluateSupportProactiveAlerts,
} from "../services/supportProactiveAlertService.js";

export interface SupportAlertMonitorStatus {
  running: boolean;
  intervalMinutes: number | null;
  startedAt: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface SupportAlertMonitorHandle {
  stop(): void;
}

let monitorHandle:
  SupportAlertMonitorHandle | null =
  null;

const status:
  SupportAlertMonitorStatus = {
    running:
      false,
    intervalMinutes:
      null,
    startedAt:
      null,
    lastStartedAt:
      null,
    lastSuccessAt:
      null,
    lastErrorAt:
      null,
    lastErrorMessage:
      null,
  };

export function getSupportAlertMonitorStatus():
  SupportAlertMonitorStatus {
  return {
    ...status,
  };
}

export function startSupportAlertMonitor(input?: {
  intervalMinutes?: number;
  runImmediately?: boolean;
}): SupportAlertMonitorHandle {
  if (
    monitorHandle
  ) {
    return monitorHandle;
  }

  const intervalMinutes =
    Math.min(
      60,
      Math.max(
        1,
        input?.intervalMinutes ??
          5,
      ),
    );

  let runningEvaluation =
    false;

  status.running =
    true;
  status.intervalMinutes =
    intervalMinutes;
  status.startedAt =
    new Date().toISOString();

  const run =
    async () => {
      if (
        runningEvaluation
      ) {
        return;
      }

      runningEvaluation =
        true;

      status.lastStartedAt =
        new Date().toISOString();

      try {
        await evaluateSupportProactiveAlerts();

        status.lastSuccessAt =
          new Date().toISOString();

        status.lastErrorAt =
          null;

        status.lastErrorMessage =
          null;
      } catch (error) {
        status.lastErrorAt =
          new Date().toISOString();

        status.lastErrorMessage =
          (
            error instanceof Error
              ? error.message
              : String(
                  error,
                )
          ).slice(
            0,
            500,
          );

        console.error(
          "[Coffer AI] Support proactive alert evaluation failed:",
          error,
        );
      } finally {
        runningEvaluation =
          false;
      }
    };

  const timer =
    setInterval(
      () => {
        void run();
      },
      intervalMinutes *
        60_000,
    );

  timer.unref?.();

  if (
    input?.runImmediately !==
    false
  ) {
    void run();
  }

  monitorHandle = {
    stop() {
      clearInterval(
        timer,
      );

      monitorHandle =
        null;

      status.running =
        false;

      status.intervalMinutes =
        null;
    },
  };

  return monitorHandle;
}

export function stopSupportAlertMonitor(): void {
  monitorHandle?.stop();
}
