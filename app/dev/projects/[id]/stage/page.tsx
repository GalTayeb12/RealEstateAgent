import { StageCalibrator } from "@/components/dev/stage/StageCalibrator";

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StageCalibrator projectId={id} />;
}
