/* =========================================================
   PAYPAL TYPES
========================================================= */

export type PayPalOrderIntent =
  | "CAPTURE"
  | "AUTHORIZE";

/* =========================================================
   AMOUNT
========================================================= */

export interface PayPalAmount {
  currency_code: string;

  value: string;
}

/* =========================================================
   PURCHASE UNIT
========================================================= */

export interface PayPalPurchaseUnit {
  reference_id?: string;

  description?: string;

  amount: PayPalAmount;

  custom_id?: string;

  invoice_id?: string;

  soft_descriptor?: string;
}

/* =========================================================
   CREATE ORDER REQUEST
========================================================= */

export interface PayPalCreateOrderInput {
  intent: PayPalOrderIntent;

  purchase_units:
    PayPalPurchaseUnit[];

  application_context?: {
    brand_name?: string;

    landing_page?:
      | "LOGIN"
      | "BILLING"
      | "NO_PREFERENCE";

    user_action?:
      | "CONTINUE"
      | "PAY_NOW";

    return_url?: string;

    cancel_url?: string;

    shipping_preference?:
      | "GET_FROM_FILE"
      | "SET_FROM_PROVIDER"
      | "NO_SHIPPING";
  };
}

/* =========================================================
   HATEOAS LINK
========================================================= */

export interface PayPalLink {
  href: string;

  rel: string;

  method?: string;
}

/* =========================================================
   CAPTURE
========================================================= */

export interface PayPalCapture {
  id: string;

  status: string;

  amount?: PayPalAmount;
}

/* =========================================================
   AUTHORIZATION
========================================================= */

export interface PayPalAuthorization {
  id: string;

  status: string;

  amount?: PayPalAmount;
}

/* =========================================================
   PAYMENT DETAILS
========================================================= */

export interface PayPalPayments {
  captures?: PayPalCapture[];

  authorizations?: PayPalAuthorization[];
}

/* =========================================================
   PURCHASE UNIT RESPONSE
========================================================= */

export interface PayPalPurchaseUnitResponse {
  reference_id?: string;

  amount?: PayPalAmount;

  payments?: PayPalPayments;
}

/* =========================================================
   ORDER RESPONSE
========================================================= */

export interface PayPalOrderResponse {
  id: string;

  status: string;

  intent?: PayPalOrderIntent;

  purchase_units?: PayPalPurchaseUnitResponse[];

  links?: PayPalLink[];
}