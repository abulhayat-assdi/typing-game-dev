import { describe, expect, it } from "vitest";
import {
  isSignable,
  publicUrlFor,
  visibilityOf,
} from "./visibility";

describe("visibility", () => {
  it("marks avatars private and catalog art public", () => {
    expect(visibilityOf("avatars/u-1/thumb.webp")).toBe("private");
    expect(visibilityOf("worlds/v/background.webp")).toBe("public");
    expect(visibilityOf("badges/b/icon.webp")).toBe("public");
  });

  it("restricts signing to private prefixes", () => {
    expect(isSignable("avatars/u-1/original.png")).toBe(true);
    expect(isSignable("worlds/v/background.webp")).toBe(false);
    expect(isSignable("../../../etc/passwd")).toBe(false);
  });

  it("builds public CDN URLs and refuses private keys", () => {
    expect(
      publicUrlFor("games/g/preview.webp", "https://cdn.example/"),
    ).toBe("https://cdn.example/games/g/preview.webp");
    expect(() => publicUrlFor("avatars/u/x.webp", "https://cdn.example")).toThrow(
      /private/,
    );
    expect(() => publicUrlFor("games/g/preview.webp", "")).toThrow(/base URL/);
  });
});
