import { NextResponse } from "next/server";
import { machineKieKey, requireInternalAuth } from "@/lib/auth";
import { getKieTask, KieError } from "@/lib/kie";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { taskId } = await ctx.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });

  const apiKey = machineKieKey();
  if (!apiKey) {
    return NextResponse.json({ error: "HELIOS_ECOM_KIE_API_KEY is not configured." }, { status: 503 });
  }

  try {
    const job = await getKieTask(taskId, apiKey);
    if (job.status === "pending") return NextResponse.json({ taskId, status: "pending" });
    if (job.status === "error") {
      return NextResponse.json({ taskId, status: "error", error: job.error ?? "Generation failed." });
    }

    const assets = (job.urls ?? []).map((url) => ({ url, type: "image" as const }));
    return NextResponse.json({
      taskId,
      status: "done",
      asset: assets[0],
      assets,
    });
  } catch (error) {
    const status = error instanceof KieError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Status lookup failed.";
    return NextResponse.json({ taskId, status: "error", error: message }, { status });
  }
}
