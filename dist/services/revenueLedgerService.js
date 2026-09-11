"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRevenueEvent = void 0;
const RevenueEvent_js_1 = require("../models/RevenueEvent.js");
const sanitizeMetadata = (metadata) => {
    if (!metadata) {
        return {};
    }
    const safe = {};
    for (const [key, value,] of Object.entries(metadata)) {
        if (!/^[A-Za-z0-9_.-]{1,50}$/.test(key)) {
            continue;
        }
        if (typeof value ===
            "string" &&
            value.length >
                120) {
            safe[key] =
                value.slice(0, 120);
            continue;
        }
        if (typeof value ===
            "string" ||
            typeof value ===
                "number" ||
            typeof value ===
                "boolean") {
            safe[key] =
                value;
        }
    }
    return safe;
};
const recordRevenueEvent = async (input) => {
    if (!Number.isSafeInteger(input.feeMinor) ||
        input.feeMinor <
            0) {
        throw new Error("feeMinor must be a non-negative safe integer.");
    }
    const volumeMinor = input.volumeMinor ??
        0;
    if (!Number.isSafeInteger(volumeMinor) ||
        volumeMinor <
            0) {
        throw new Error("volumeMinor must be a non-negative safe integer.");
    }
    const result = await RevenueEvent_js_1.RevenueEvent.findOneAndUpdate({
        idempotencyKey: input.idempotencyKey,
    }, {
        $setOnInsert: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
            kind: input.kind,
            feeMinor: input.feeMinor,
            volumeMinor,
            sourceReference: input.sourceReference,
            occurredAt: input.occurredAt ??
                new Date(),
            metadata: sanitizeMetadata(input.metadata),
        },
    }, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
    });
    return result;
};
exports.recordRevenueEvent = recordRevenueEvent;
