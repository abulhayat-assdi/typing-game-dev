import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  createTranslator,
  getMessages,
  getNamespaceMaps,
  getTranslator,
  isLocale,
  resolveLocale,
  splitLocalePrefix,
  type Namespace,
} from "./i18n";

describe("resolveLocale", () => {
  it("accepts en/bn case-insensitively with whitespace", () => {
    expect(resolveLocale("bn")).toBe("bn");
    expect(resolveLocale(" BN ")).toBe("bn");
    expect(resolveLocale("EN")).toBe("en");
  });

  it("falls back to the default locale for anything else", () => {
    expect(resolveLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(42)).toBe(DEFAULT_LOCALE);
  });

  it("isLocale narrows correctly", () => {
    expect(isLocale("bn")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});

describe("splitLocalePrefix", () => {
  it("splits locale-prefixed paths", () => {
    expect(splitLocalePrefix("/bn/dashboard")).toEqual({
      locale: "bn",
      path: "/dashboard",
    });
    expect(splitLocalePrefix("/en")).toEqual({ locale: "en", path: "/" });
  });

  it("returns null locale for unprefixed paths", () => {
    expect(splitLocalePrefix("/dashboard")).toEqual({
      locale: null,
      path: "/dashboard",
    });
    expect(splitLocalePrefix("/fr/x")).toEqual({
      locale: null,
      path: "/fr/x",
    });
  });
});

describe("catalog loading", () => {
  it("loads English strings", () => {
    const t = getTranslator("en", "home");
    expect(t("title")).toContain("adventure");
    expect(getMessages("en").common.appName).not.toBe("");
  });

  it("loads Bangla strings (distinct from English)", () => {
    const t = getTranslator("bn", "home");
    expect(t("title")).not.toBe("");
    expect(t("title")).not.toBe(getTranslator("en", "home")("title"));
  });

  it("falls back to English for missing Bangla keys", () => {
    const t = createTranslator<{ present: string; missing: string }>(
      { present: "বাংলা" },
      { present: "present", missing: "fallback-value" },
    );
    expect(t("present")).toBe("বাংলা");
    expect(t("missing")).toBe("fallback-value");
  });

  it("renders a marker instead of crashing on unknown keys", () => {
    const t = createTranslator<Record<string, string>>({}, {});
    expect(t("nope")).toBe("[nope]");
  });

  it("interpolates {vars} and leaves unknown placeholders intact", () => {
    const t = getTranslator("en", "errors");
    expect(t("passwordTooShort", { min: 8 })).toContain("8");
    expect(t("passwordTooShort")).toContain("{min}");
  });

  it("Bangla catalogs introduce no unknown keys", () => {
    const { en, bn } = getNamespaceMaps();
    (Object.keys(en) as Namespace[]).forEach((ns) => {
      const enKeys = new Set(Object.keys(en[ns]));
      for (const key of Object.keys(bn[ns] ?? {})) {
        expect(
          enKeys.has(key),
          `bn/${ns}.json has unknown key "${key}"`,
        ).toBe(true);
      }
    });
  });

  it("no shipped string is empty", () => {
    const { en, bn } = getNamespaceMaps();
    (Object.keys(en) as Namespace[]).forEach((ns) => {
      for (const [k, v] of Object.entries(en[ns])) {
        expect(v.length, `en/${ns}.json:${k}`).toBeGreaterThan(0);
      }
      for (const [k, v] of Object.entries(bn[ns] ?? {})) {
        expect(typeof v === "string" && v.length > 0, `bn/${ns}.json:${k}`).toBe(
          true,
        );
      }
    });
  });
});
