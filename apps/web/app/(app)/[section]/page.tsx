"use client";

import { use } from "react";
import { SECTION_LABELS, type Section } from "@business-os/types";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";

/** Placeholder for section areas (CRM/POS/HRMS/Automations) built in later phases. */
export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { t } = useSession();
  const label = SECTION_LABELS[section as Section] ?? section.replace(/^\w/, (c) => c.toUpperCase());

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{label}</h1>
      <Card>
        <p className="text-sm text-gray-400">
          The <span className="text-gray-200">{label}</span> workspace is coming in the next phase.
          {section === "crm" && (
            <>
              {" "}You&apos;ll manage {t("leads")}, pipelines, and {t("deals")} here.
            </>
          )}
        </p>
      </Card>
    </>
  );
}
