import {
  describe,
  expect,
  it,
} from "vitest";

import {
  forecastSupportCaseSla,
} from "../src/modules/coffer-ai/services/supportCaseSlaService.js";

describe(
  "Support AI SLA forecast",
  () => {
    it(
      "marks a case breached after its due time without first response",
      () => {
        const createdAt =
          new Date(
            "2026-09-22T00:00:00.000Z",
          );

        const result =
          forecastSupportCaseSla({
            createdAt,
            dueAt:
              new Date(
                "2026-09-22T00:30:00.000Z",
              ),
            responseTargetMinutes:
              30,
            firstResponseAt:
              null,
            now:
              new Date(
                "2026-09-22T00:31:00.000Z",
              ),
          });

        expect(
          result.state,
        ).toBe(
          "breached",
        );
      },
    );

    it(
      "marks responded after first response",
      () => {
        const result =
          forecastSupportCaseSla({
            createdAt:
              new Date(
                "2026-09-22T00:00:00.000Z",
              ),
            dueAt:
              new Date(
                "2026-09-22T00:30:00.000Z",
              ),
            responseTargetMinutes:
              30,
            firstResponseAt:
              new Date(
                "2026-09-22T00:10:00.000Z",
              ),
            now:
              new Date(
                "2026-09-22T01:00:00.000Z",
              ),
          });

        expect(
          result.state,
        ).toBe(
          "responded",
        );
      },
    );
  },
);
