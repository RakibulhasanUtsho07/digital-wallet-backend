import {
  DemoPaymentProvider,
} from "./providers/demoPaymentProvider.js";

import {
  PAYMENT_PROVIDER_NAMES,
  type PaymentProvider,
  type PaymentProviderName,
} from "./paymentProvider.js";

/* =========================================================
   PROVIDER REGISTRY
========================================================= */

/*
 * Create one adapter per provider.
 *
 * This guarantees that every returned adapter implements
 * the SAME PaymentProvider contract.
 */

const providerRegistry =
  new Map<
    PaymentProviderName,
    PaymentProvider
  >();

for (
  const providerName of PAYMENT_PROVIDER_NAMES
) {
  providerRegistry.set(
    providerName,
    new DemoPaymentProvider(
      providerName
    )
  );
}

/* =========================================================
   GET PROVIDER
========================================================= */

export const getPaymentProvider = (
  providerName: string
): PaymentProvider | undefined => {
  return providerRegistry.get(
    providerName as PaymentProviderName
  );
};

/* =========================================================
   LIST PROVIDERS
========================================================= */

export const getRegisteredPaymentProviders =
  (): PaymentProviderName[] => {
    return Array.from(
      providerRegistry.keys()
    );
  };

/* =========================================================
   PROVIDER EXISTS
========================================================= */

export const hasPaymentProvider = (
  providerName: string
): boolean => {
  return providerRegistry.has(
    providerName as PaymentProviderName
  );
};