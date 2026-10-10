import {
  runSupportAiMaintenance,
} from "../services/supportAiMaintenanceService.js";

export interface SupportMaintenanceMonitorStatus {
  running: boolean;
  intervalHours: number | null;
  startedAt: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

let timer:
  ReturnType<typeof setInterval> | null =
  null;

const status:
  SupportMaintenanceMonitorStatus = {
    running:
      false,
    intervalHours:
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

export function getSupportMaintenanceMonitorStatus() {
  return {
    ...status,
  };
}

export function startSupportMaintenanceMonitor(input?: {
  intervalHours?: number;
  runImmediately?: boolean;
}) {
  if (
    timer
  ) {
    return;
  }

  const intervalHours =
    Math.min(
      168,
      Math.max(
        6,
        input?.intervalHours ??
          24,
      ),
    );

  let active =
    false;

  const run =
    async () => {
      if (
        active
      ) {
        return;
      }

      active =
        true;

      status.lastStartedAt =
        new Date().toISOString();

      try {
        await runSupportAiMaintenance();

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
          "[Coffer AI] Support maintenance failed:",
          error,
        );
      } finally {
        active =
          false;
      }
    };

  status.running =
    true;
  status.intervalHours =
    intervalHours;
  status.startedAt =
    new Date().toISOString();

  timer =
    setInterval(
      () => {
        void run();
      },
      intervalHours *
        60 *
        60 *
        1_000,
    );

  timer.unref?.();

  if (
    input?.runImmediately ===
    true
  ) {
    void run();
  }
}

export function stopSupportMaintenanceMonitor() {
  if (
    timer
  ) {
    clearInterval(
      timer,
    );

    timer =
      null;
  }

  status.running =
    false;
  status.intervalHours =
    null;
}
