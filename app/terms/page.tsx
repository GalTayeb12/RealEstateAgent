import LegalDocument from "@/components/legal/LegalDocument";
import { terms } from "@/lib/legal/content";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function TermsPage() {
  const locale = await getRequestLocale();
  return <LegalDocument doc={locale === "en" ? terms.en : terms.he} />;
}
