const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api"
).replace(/\/+$/, "");

/* =========================================================
   TYPES
========================================================= */

export type ApiOptions =
  RequestInit & {
    token?: string;
  };

interface ApiErrorResponse {
  success?: boolean;
  message?: unknown;
  error?: unknown;
}

/* =========================================================
   URL BUILDER
========================================================= */

function createRequestUrl(
  endpoint: string
): string {
  const normalizedEndpoint =
    endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;

  return `${API_URL}${normalizedEndpoint}`;
}

/* =========================================================
   ERROR MESSAGE
========================================================= */

function getErrorMessage(
  data: unknown,
  status: number
): string {
  const fallbackMessage =
    `Request failed with status ${status}.`;

  if (
    typeof data !== "object" ||
    data === null
  ) {
    return fallbackMessage;
  }

  const errorData =
    data as ApiErrorResponse;

  if (
    typeof errorData.message ===
      "string" &&
    errorData.message.trim()
  ) {
    return errorData.message.trim();
  }

  if (
    typeof errorData.error ===
      "string" &&
    errorData.error.trim()
  ) {
    return errorData.error.trim();
  }

  return fallbackMessage;
}

/* =========================================================
   API CLIENT
========================================================= */

export async function apiClient<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const {
    token,
    headers,
    body,
    ...requestOptions
  } = options;

  /* =======================================================
     REQUEST HEADERS
  ======================================================== */

  const requestHeaders =
    new Headers(headers);

  const isFormData =
    typeof FormData !== "undefined" &&
    body instanceof FormData;

  /*
   * FormData request-এর Content-Type browser নিজে
   * boundary-সহ তৈরি করবে।
   */
  if (isFormData) {
    requestHeaders.delete(
      "Content-Type"
    );

    requestHeaders.delete(
      "content-type"
    );
  } else if (
    body !== undefined &&
    body !== null &&
    !requestHeaders.has(
      "Content-Type"
    )
  ) {
    requestHeaders.set(
      "Content-Type",
      "application/json"
    );
  }

  if (
    token?.trim() &&
    !requestHeaders.has(
      "Authorization"
    )
  ) {
    requestHeaders.set(
      "Authorization",
      `Bearer ${token.trim()}`
    );
  }

  if (
    !requestHeaders.has(
      "Accept"
    )
  ) {
    requestHeaders.set(
      "Accept",
      "application/json"
    );
  }

  /* =======================================================
     FETCH
  ======================================================== */

  let response: Response;

  try {
    response =
      await fetch(
        createRequestUrl(endpoint),
        {
          ...requestOptions,

          headers:
            requestHeaders,

          body,

          /*
           * Cookie-based authentication support.
           */
          credentials:
            requestOptions.credentials ??
            "include",
        }
      );
  } catch (error: unknown) {
    console.error(
      "API NETWORK ERROR:",
      error
    );

    throw new Error(
      "Unable to connect to the server. Please make sure the backend is running."
    );
  }

  /* =======================================================
     READ RESPONSE
  ======================================================== */

  let rawResponse = "";

  try {
    rawResponse =
      await response.text();
  } catch {
    rawResponse = "";
  }

  /* =======================================================
     PARSE RESPONSE
  ======================================================== */

  let data: unknown =
    null;

  if (rawResponse.trim()) {
    try {
      data =
        JSON.parse(rawResponse);
    } catch {
      /*
       * Backend HTML অথবা plain-text error পাঠালেও
       * JSON parsing error হবে না।
       */
      data = {
        message:
          rawResponse,
      };
    }
  }

  /* =======================================================
     HANDLE ERROR RESPONSE
  ======================================================== */

  if (!response.ok) {
    let message =
      getErrorMessage(
        data,
        response.status
      );

    /*
     * Large HTML error page UI-তে দেখানো হবে না।
     */
    if (
      message.length > 500
    ) {
      message =
        `Server error (${response.status}). Please try again.`;
    }

    throw new Error(message);
  }

  /* =======================================================
     EMPTY SUCCESS RESPONSE
  ======================================================== */

  if (
    response.status === 204 ||
    !rawResponse.trim()
  ) {
    return undefined as T;
  }

  return data as T;
}