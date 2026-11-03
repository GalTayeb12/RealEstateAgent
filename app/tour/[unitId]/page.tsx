"use client";

import { use } from "react";
import { useI18n } from "@/components/LocaleProvider";
import TourLayout from "@/components/tour/TourLayout";

export default function TourPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const { m } = useI18n();

  return <TourLayout unitId={unitId} isModal={false} strings={m.tour} />;
}
