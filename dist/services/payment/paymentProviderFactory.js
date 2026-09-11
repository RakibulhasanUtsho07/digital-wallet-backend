"use strict";
/* =========================================================
   PAYMENT PROVIDER CONTRACT
========================================================= */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentSourceType = exports.isPaymentProviderName = exports.PAYMENT_PROVIDER_NAMES = void 0;
/* =========================================================
   PROVIDERS
========================================================= */
exports.PAYMENT_PROVIDER_NAMES = [
    "bkash",
    "nagad",
    "rocket",
    "upay",
    "dbbl",
    "brac",
    "city",
    "ebl",
    "bankasia",
    "prime",
    "sonali",
];
/* =========================================================
   TYPE GUARDS
========================================================= */
const isPaymentProviderName = (value) => {
    return (typeof value ===
        "string" &&
        exports.PAYMENT_PROVIDER_NAMES.includes(value));
};
exports.isPaymentProviderName = isPaymentProviderName;
/* =========================================================
   SOURCE TYPE HELPER
========================================================= */
const getPaymentSourceType = (provider) => {
    switch (provider) {
        case "bkash":
        case "nagad":
        case "rocket":
        case "upay":
            return "mfs";
        case "dbbl":
        case "brac":
        case "city":
        case "ebl":
        case "bankasia":
        case "prime":
        case "sonali":
            return "bank";
        default:
            return "bank";
    }
};
exports.getPaymentSourceType = getPaymentSourceType;
