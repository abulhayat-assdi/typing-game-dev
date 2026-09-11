import { describe, expect, it } from "vitest";
import {
  FUTURE_PATHS,
  classifyRoute,
  homeUrl,
  isAuthPath,
  isValidLocalePrefix,
  loginUrl,
} from "./routes";

describe("classifyRoute", () => {
  it("marks landing/auth/legal paths public", () => {
    for (const p of ["/en", "/en/", "/bn/login", "/en/register", "/bn/terms"]) {
      expect(classifyRoute(p).access, p).toBe("public");
    }
  });

  it("marks everything else protected by default (default-deny)", () => {
    for (const p of [
      "/en/dashboard",
      "/bn/profile",
      "/en/staff",
      "/en/api-private",
    ]) {
      expect(classifyRoute(p).access, p).toBe("protected");
    }
    for (const mod of [...FUTURE_PATHS.student, ...FUTURE_PATHS.staff]) {
      expect(classifyRoute(`/en${mod}`).access, mod).toBe("protected");
      expect(classifyRoute(`/bn${mod}`).access, mod).toBe("protected");
    }
  });

  it("flags locale-less UI paths for redirect, never API paths", () => {
    expect(classifyRoute("/dashboard").needsLocaleRedirect).toBe(true);
    expect(classifyRoute("/api/health").needsLocaleRedirect).toBe(false);
    expect(classifyRoute("/api/r2/signed-url").access).toBe("protected");
  });

  it("exposes locale + stripped path", () => {
    expect(classifyRoute("/bn/map")).toMatchObject({
      locale: "bn",
      path: "/map",
    });
    expect(classifyRoute("/api/health")).toMatchObject({
      locale: null,
      path: "/api/health",
    });
  });
});

describe("auth-path helpers", () => {
  it("builds login redirects preserving destination", () => {
    expect(loginUrl("en", "/en/map")).toBe("/en/login?next=%2Fen%2Fmap");
    expect(loginUrl("bn")).toBe("/bn/login");
    expect(loginUrl("en", "/en/login")).toBe("/en/login");
  });

  it("identifies auth paths and home URLs", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/map")).toBe(false);
    expect(homeUrl("bn")).toBe("/bn");
  });

  it("validates locale prefixes", () => {
    expect(isValidLocalePrefix("/en/x")).toBe(true);
    expect(isValidLocalePrefix("/fr/x")).toBe(false);
    expect(isValidLocalePrefix("/")).toBe(true);
  });
});
