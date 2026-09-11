import { describe, expect, it } from "vitest";
import {
  landingForRoles,
  loginGate,
  validateEmail,
  validateMatch,
  validatePassword,
  validateRegistration,
  validateRequired,
} from "./auth-flow";

describe("validators", () => {
  it("requires non-blank values", () => {
    expect(validateRequired("x")).toBeNull();
    expect(validateRequired("  ")).toBe("required");
  });

  it("validates email shape", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("")).toBe("required");
    expect(validateEmail("nope")).toBe("invalid-email");
    expect(validateEmail("a@b")).toBe("invalid-email");
  });

  it("enforces password strength", () => {
    expect(validatePassword("abc12345")).toBeNull();
    expect(validatePassword("")).toBe("required");
    expect(validatePassword("short1")).toBe("weak-password");
    expect(validatePassword("longbutnodigits")).toBe("weak-password");
    expect(validatePassword("12345678")).toBe("weak-password");
  });

  it("matches confirmation", () => {
    expect(validateMatch("a1b2c3d4", "a1b2c3d4")).toBeNull();
    expect(validateMatch("a", "b")).toBe("mismatch");
    expect(validateMatch("", "")).toBe("required");
  });

  it("validates a full registration payload", () => {
    const good = {
      joinCode: "SALES-101",
      rollNumber: "R-01",
      fullName: "Stu Dent",
      email: "s@example.com",
      password: "abc12345",
      confirmPassword: "abc12345",
      skillTrack: "beginner",
      terms: true,
    };
    expect(validateRegistration(good)).toEqual({});
    const bad = validateRegistration({
      ...good,
      email: "bad",
      confirmPassword: "zzz",
      skillTrack: "wizard",
      terms: false,
      joinCode: " ",
    });
    expect(bad).toMatchObject({
      email: "invalid-email",
      confirmPassword: "mismatch",
      skillTrack: "required",
      terms: "terms-required",
      joinCode: "required",
    });
  });
});

describe("landingForRoles", () => {
  it("resolves by highest privilege, never by params", () => {
    expect(landingForRoles(["student"], "en")).toBe("/en/dashboard");
    expect(landingForRoles(["teacher"], "bn")).toBe("/bn/teacher");
    expect(landingForRoles(["admin"], "en")).toBe("/en/admin");
    expect(landingForRoles(["super_admin"], "en")).toBe("/en/super-admin");
    expect(landingForRoles(["student", "teacher", "admin"], "en")).toBe(
      "/en/admin",
    );
    expect(landingForRoles([], "en")).toBe("/en/dashboard");
  });
});

describe("loginGate", () => {
  it("blocks non-active accounts", () => {
    expect(loginGate("active")).toBeNull();
    expect(loginGate(null)).toBeNull();
    expect(loginGate("suspended")).toBe("suspended");
    expect(loginGate("inactive")).toBe("inactive");
  });
});
