export const NID_PATTERN = /^(?:\d{10}|\d{13}|\d{17})$/;
export const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class InputValidationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export function parseStrictDate(value: string): Date {
  if (!DOB_PATTERN.test(value)) {
    throw new InputValidationError("Date of birth must use YYYY-MM-DD.", "DOB_FORMAT_INVALID");
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new InputValidationError("Date of birth is not a valid calendar date.", "DOB_CALENDAR_INVALID");
  }

  return parsed;
}

export function getAgeOnDate(dateOfBirth: Date, onDate = new Date()): number {
  let age = onDate.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    onDate.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (onDate.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      onDate.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function requireAdult(dateOfBirth: Date, onDate = new Date()): void {
  if (dateOfBirth.getTime() > onDate.getTime()) {
    throw new InputValidationError("Date of birth cannot be in the future.", "DOB_FUTURE");
  }
  if (getAgeOnDate(dateOfBirth, onDate) < 18) {
    throw new InputValidationError("Applicant must be at least 18 years old.", "AGE_UNDER_18");
  }
}

export function validateAndNormalizeNID(nidInput: string, dateOfBirth: Date): string {
  const nid = nidInput.replace(/[\s-]/g, "");
  if (!NID_PATTERN.test(nid)) {
    throw new InputValidationError("NID must contain exactly 10, 13, or 17 digits.", "NID_FORMAT_INVALID");
  }

  // The EC contract commonly expects 17 digits for a legacy 13-digit identifier.
  // This rule follows the requested gateway policy: prepend the applicant birth year.
  return nid.length === 13 ? `${dateOfBirth.getUTCFullYear()}${nid}` : nid;
}

export function validateSubmissionIdentity(input: {
  nid: string;
  dateOfBirth: string;
  claimedName: string;
}, onDate = new Date()): { normalizedNid: string; dateOfBirth: Date; claimedName: string } {
  const dateOfBirth = parseStrictDate(input.dateOfBirth);
  requireAdult(dateOfBirth, onDate);
  const claimedName = input.claimedName.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (claimedName.length < 2 || claimedName.length > 160) {
    throw new InputValidationError("Applicant name must contain 2 to 160 characters.", "NAME_INVALID");
  }
  return {
    normalizedNid: validateAndNormalizeNID(input.nid, dateOfBirth),
    dateOfBirth,
    claimedName,
  };
}
