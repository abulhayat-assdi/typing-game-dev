import { describe, expect, it } from "vitest";
import {
  R2KeyError,
  audioKey,
  avatarKey,
  badgeKey,
  competitionKey,
  cosmeticKey,
  gameKey,
  isValidR2Key,
  parseR2Key,
  promoKey,
  soundKey,
  uiKey,
  worldKey,
} from "./keys";

describe("key builders", () => {
  it("builds canonical keys", () => {
    expect(avatarKey("u-1", "thumb", "WEBP")).toBe("avatars/u-1/thumb.webp");
    expect(badgeKey("first-key")).toBe("badges/first-key/icon.webp");
    expect(worldKey("keyboard-village", "background")).toBe(
      "worlds/keyboard-village/background.webp",
    );
    expect(gameKey("find-the-key", "preview", "png")).toBe(
      "games/find-the-key/preview.png",
    );
    expect(soundKey("fx", "pop.mp3")).toBe("sound/fx/pop.mp3");
    expect(audioKey("music", "theme.ogg")).toBe("audio/music/theme.ogg");
    expect(uiKey("brand", "logo.svg")).toBe("ui/brand/logo.svg");
    expect(competitionKey("c1", "banner.avif")).toBe(
      "competition/c1/banner.avif",
    );
    expect(cosmeticKey("aura-gold")).toBe("cosmetics/aura-gold/asset.webp");
    expect(promoKey("launch", "hero.jpg")).toBe("promo/launch/hero.jpg");
  });

  it("rejects bad builder inputs", () => {
    expect(() => avatarKey("../x", "thumb", "png")).toThrow(R2KeyError);
    expect(() => avatarKey("u", "thumb", "exe")).toThrow(R2KeyError);
    expect(() => soundKey("fx", "pop.png")).toThrow(R2KeyError);
    expect(() => badgeKey("ok", "mp3")).toThrow(R2KeyError);
  });
});

describe("parseR2Key", () => {
  it("accepts well-formed keys", () => {
    expect(parseR2Key("worlds/village/background.webp")).toBe(
      "worlds/village/background.webp",
    );
    expect(isValidR2Key("audio/m/volume-01.mp3")).toBe(true);
  });

  it("rejects path traversal", () => {
    for (const bad of [
      "avatars/../../etc/passwd",
      "avatars/../badges/x.webp",
      "worlds/a/../../b.webp",
      "..",
      "../x.webp",
      "avatars/%2e%2e/x.webp",
    ]) {
      expect(isValidR2Key(bad), bad).toBe(false);
      expect(() => parseR2Key(bad)).toThrow(R2KeyError);
    }
  });

  it("rejects slashes, escapes and URLs", () => {
    for (const bad of [
      "/avatars/u/thumb.webp",
      "avatars\\u\\thumb.webp",
      "avatars//double.webp",
      "https://evil.example/x.webp",
      "avatars/u/thumb.webp\n",
      "avatars/u/thu\0mb.webp",
      "avatars/u/my file.webp",
    ]) {
      expect(isValidR2Key(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects unknown prefixes, bad segments and extensions", () => {
    expect(isValidR2Key("secrets/u/x.webp")).toBe(false);
    expect(isValidR2Key("Avatars/u/x.webp")).toBe(false);
    expect(isValidR2Key("avatars")).toBe(false);
    expect(isValidR2Key("avatars/u/thumb.exe")).toBe(false);
    expect(isValidR2Key("sound/fx/pop.webp")).toBe(false);
    expect(isValidR2Key("")).toBe(false);
    expect(isValidR2Key(null)).toBe(false);
    expect(isValidR2Key(42)).toBe(false);
    expect(isValidR2Key("a".repeat(600))).toBe(false);
  });
});
