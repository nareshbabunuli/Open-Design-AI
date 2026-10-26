import { notFound } from "next/navigation";
import TestPlayground from "@/components/test-labs/test-playground";

const validCases = new Set(["test-case-123", "test-case-456", "test-case-789"]);

export default async function TestCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!validCases.has(caseId)) notFound();
  return <TestPlayground caseId={caseId} />;
}
