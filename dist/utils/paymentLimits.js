"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAddMoneyAmount = exports.MAX_ADD_MONEY = exports.MIN_ADD_MONEY = void 0;
exports.MIN_ADD_MONEY = 10;
exports.MAX_ADD_MONEY = 100000;
const validateAddMoneyAmount = (amount) => {
    if (!Number.isFinite(amount)) {
        return "Invalid amount.";
    }
    if (amount < exports.MIN_ADD_MONEY) {
        return `Minimum add money amount is ৳${exports.MIN_ADD_MONEY}.`;
    }
    if (amount >
        exports.MAX_ADD_MONEY) {
        return `Maximum add money amount is ৳${exports.MAX_ADD_MONEY}.`;
    }
    const minor = Math.round(amount * 100);
    if (!Number.isSafeInteger(minor)) {
        return "Invalid money precision.";
    }
    return null;
};
exports.validateAddMoneyAmount = validateAddMoneyAmount;
