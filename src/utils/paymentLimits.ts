export const MIN_ADD_MONEY =
  10;

export const MAX_ADD_MONEY =
  100000;

export const validateAddMoneyAmount =
  (
    amount: number
  ): string | null => {
    if (
      !Number.isFinite(amount)
    ) {
      return "Invalid amount.";
    }

    if (
      amount < MIN_ADD_MONEY
    ) {
      return `Minimum add money amount is ৳${MIN_ADD_MONEY}.`;
    }

    if (
      amount >
      MAX_ADD_MONEY
    ) {
      return `Maximum add money amount is ৳${MAX_ADD_MONEY}.`;
    }

    const minor =
      Math.round(amount * 100);

    if (
      !Number.isSafeInteger(minor)
    ) {
      return "Invalid money precision.";
    }

    return null;
  };