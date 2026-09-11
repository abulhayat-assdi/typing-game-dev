/**
 * Client-safe auth flow logic (M7). Pure validation + role resolution — no
 * Supabase, no network, no secrets. Validators return error CODES; UI maps
 * them to localized strings. Server re-validates everything.
 */
import type { Locale } from "./i18n";

export type ValidationCode =
  | "required"
  | "invalid-email"
  | "weak-password"
  | "mismatch"
  | "terms-required";

export function validateRequired(value: string): ValidationCode | null {
  return value.trim().length > 0 ? null : "required";
}

export function validateEmail(value: string): ValidationCode | null {
  if (value.trim().length === 0) return "required";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
    ? null
    : "invalid-email";
}

/** Minimum 8 chars with letters and numbers (matches server policy text). */
export function validatePassword(value: string): ValidationCode | null {
  if (value.length === 0) return "required";
  const ok =
    value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
  return ok ? null : "weak-password";
}

export function validateMatch(a: string, b: string): ValidationCode | null {
  if (a.length === 0 || b.length === 0) return "required";
  return a === b ? null : "mismatch";
}

export interface RegistrationInput {
  joinCode: string;
  rollNumber: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  skillTrack: string;
  terms: boolean;
}

export function validateRegistration(
  input: RegistrationInput,
): Partial<Record<keyof RegistrationInput, ValidationCode>> {
  const errors: Partial<Record<keyof RegistrationInput, ValidationCode>> = {};
  const req = (
    key: keyof RegistrationInput,
    value: string,
    check: (v: string) => ValidationCode | null,
  ): void => {
    const code = check(value);
    if (code) errors[key] = code;
  };
  req("joinCode", input.joinCode, validateRequired);
  req("rollNumber", input.rollNumber, validateRequired);
  req("fullName", input.fullName, validateRequired);
  req("email", input.email, validateEmail);
  req("password", input.password, validatePassword);
  const mismatch = validateMatch(input.password, input.confirmPassword);
  if (mismatch) errors.confirmPassword = mismatch;
  if (!["beginner", "intermediate", "expert"].includes(input.skillTrack)) {
    errors.skillTrack = "required";
  }
  if (!input.terms) errors.terms = "terms-required";
  return errors;
}

export type AppRole = "student" | "teacher" | "admin" | "super_admin";

/** Server-resolved landing (actor API); priority never comes from params. */
export function landingForRoles(roles: AppRole[], locale: Locale): string {
  if (roles.includes("super_admin")) return `/${locale}/super-admin`;
  if (roles.includes("admin")) return `/${locale}/admin`;
  if (roles.includes("teacher")) return `/${locale}/teacher`;
  return `/${locale}/dashboard`;
}

export type AccountStatus = "active" | "inactive" | "suspended";

/** Login gate message key (null = may proceed). */
export function loginGate(status: AccountStatus | null): "suspended" | "inactive" | null {
  if (status === "suspended") return "suspended";
  if (status === "inactive") return "inactive";
  return null;
}
