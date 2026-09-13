"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin shop item creation (configuration form, not a visual editor). */
const CATEGORIES = [
  "avatar_frames",
  "profile_effects",
  "titles",
  "badge_variants",
  "clan_banners",
  "clan_emblems",
  "map_effects",
  "victory_animations",
  "result_effects",
  "sound_packs",
  "utility",
];

const TYPES = ["cosmetic", "profile", "clan_cosmetic", "utility"];

export function ShopForm({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "shop");
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("avatar_frames");
  const [itemType, setItemType] = useState("cosmetic");
  const [price, setPrice] = useState("100");
  const [assetKey, setAssetKey] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          description: "",
          category,
          itemType,
          assetKey: assetKey.trim() || null,
          previewKey: previewKey.trim() || null,
          priceCoins: Number.parseInt(price, 10),
          featured: false,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${String(res.status)}`);
      router.push(`/${locale}/admin/shop`);
      router.refresh();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  const valid =
    /^[a-z0-9-]{1,80}$/.test(slug.trim()) &&
    name.trim().length > 0 &&
    name.trim().length <= 160 &&
    Number.isInteger(Number.parseInt(price, 10)) &&
    Number.parseInt(price, 10) >= 0;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldSlug")}
        <input
          className="tap-input"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldName")}
        <input
          className="tap-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldCategory")}
        <select
          className="tap-input"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldType")}
        <select
          className="tap-input"
          value={itemType}
          onChange={(e) => {
            setItemType(e.target.value);
          }}
        >
          {TYPES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldPrice")}
        <input
          className="tap-input"
          inputMode="numeric"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldAsset")}
        <input
          className="tap-input"
          value={assetKey}
          placeholder="cosmetics/slug/asset.png"
          onChange={(e) => {
            setAssetKey(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fieldPreview")}
        <input
          className="tap-input"
          value={previewKey}
          placeholder="cosmetics/slug/preview.png"
          onChange={(e) => {
            setPreviewKey(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="tap-btn tap-btn-primary"
        disabled={saving || !valid}
        onClick={() => {
          void save();
        }}
      >
        {t("createTitle")}
      </button>
    </div>
  );
}
