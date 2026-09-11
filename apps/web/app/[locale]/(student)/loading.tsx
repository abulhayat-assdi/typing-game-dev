import { LoadingState } from "@tap/ui";
import { getTranslator } from "../../../lib/i18n";

/** Student area loading state (default-locale label; boundaries get no params). */
export default function StudentLoading() {
  const t = getTranslator("en", "a11y");
  return (
    <div className="py-8">
      <LoadingState label={t("loadingContent")} />
    </div>
  );
}
