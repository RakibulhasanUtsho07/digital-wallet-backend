"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportSlaRemainingMinutes = exports.calculateSupportSlaDueAt = exports.getSupportSlaMinutes = void 0;
const SLA_MINUTES = {
    Urgent: 30,
    High: 120,
    Normal: 480,
    Low: 1440,
};
const getSupportSlaMinutes = (priority) => SLA_MINUTES[priority];
exports.getSupportSlaMinutes = getSupportSlaMinutes;
const calculateSupportSlaDueAt = (priority, from = new Date()) => new Date(from.getTime() +
    (0, exports.getSupportSlaMinutes)(priority) *
        60 *
        1000);
exports.calculateSupportSlaDueAt = calculateSupportSlaDueAt;
const getSupportSlaRemainingMinutes = (dueAt, now = new Date()) => Math.ceil((dueAt.getTime() -
    now.getTime()) /
    60000);
exports.getSupportSlaRemainingMinutes = getSupportSlaRemainingMinutes;
