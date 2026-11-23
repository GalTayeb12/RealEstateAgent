import LegalDocument from "@/components/legal/LegalDocument";
import { privacy } from "@/lib/legal/content";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  return <LegalDocument doc={locale === "en" ? privacy.en : privacy.he} />;
}
