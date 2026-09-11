"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPaymentProvider = exports.getRegisteredPaymentProviders = exports.getPaymentProvider = void 0;
const demoPaymentProvider_js_1 = require("./providers/demoPaymentProvider.js");
const paymentProvider_js_1 = require("./paymentProvider.js");
/* =========================================================
   PROVIDER REGISTRY
========================================================= */
/*
 * Create one adapter per provider.
 *
 * This guarantees that every returned adapter implements
 * the SAME PaymentProvider contract.
 */
const providerRegistry = new Map();
for (const providerName of paymentProvider_js_1.PAYMENT_PROVIDER_NAMES) {
    providerRegistry.set(providerName, new demoPaymentProvider_js_1.DemoPaymentProvider(providerName));
}
/* =========================================================
   GET PROVIDER
========================================================= */
const getPaymentProvider = (providerName) => {
    return providerRegistry.get(providerName);
};
exports.getPaymentProvider = getPaymentProvider;
/* =========================================================
   LIST PROVIDERS
========================================================= */
const getRegisteredPaymentProviders = () => {
    return Array.from(providerRegistry.keys());
};
exports.getRegisteredPaymentProviders = getRegisteredPaymentProviders;
/* =========================================================
   PROVIDER EXISTS
========================================================= */
const hasPaymentProvider = (providerName) => {
    return providerRegistry.has(providerName);
};
exports.hasPaymentProvider = hasPaymentProvider;
