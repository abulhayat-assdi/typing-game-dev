import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { requireAdmin } from "../../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { ForbiddenError } from "../../../../../lib/server/staff-store";
import { ForbiddenBlock } from "../../../../../components/forbidden-block";
import {
  AccountStatusSelect,
  MembershipEditor,
} from "../../../../../components/admin-forms";

export default async function AdminStudentPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "staff");
  const session = await getSession();
  const client = session ? await userDbClient() : null;
  if (!session || !client) return <ForbiddenBlock locale={locale} />;
  let detail;
  let memberships: Array<{
    memberId: string;
    batchId: string;
    batchName: string;
    rollNumber: string;
    isActive: boolean;
    organizationId: string;
  }> = [];
  let batches: Array<{ id: string; name: string }> = [];
  try {
    const { orgIds } = await requireAdmin(client);
    const store = createSupabaseStaffStore(client);
    const found = await store.getUserDetail(params.id);
    if (!found) notFound();
    detail = found;
    const all = await store.membershipsOf(params.id);
    memberships = all.filter(
      (m) => orgIds === null || orgIds.includes(m.organizationId),
    );
    if (all.length > 0 && memberships.length === 0) {
      throw new ForbiddenError();
    }
    batches = (await store.listBatches(orgIds)).map((b) => ({
      id: b.id,
      name: b.name,
    }));
  } catch (e) {
    if (e instanceof ForbiddenError) return <ForbiddenBlock locale={locale} />;
    throw e;
  }
  const active = memberships.find((m) => m.isActive);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.fullName}
        description={`${detail.email} · ${t("level")} ${String(detail.level)} · XP ${String(detail.xpTotal)}`}
      />
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("colStatus")}</h2>
          <AccountStatusSelect
            locale={locale}
            userId={detail.userId}
            status={detail.status}
          />
        </CardContent>
      </Card>
      {active ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-base font-bold">
              {active.batchName} · {active.rollNumber}
            </h2>
            <MembershipEditor
              locale={locale}
              userId={detail.userId}
              rollNumber={active.rollNumber}
              isActive={active.isActive}
              batches={batches}
              currentBatchId={active.batchId}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">{t("statusInactive")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
