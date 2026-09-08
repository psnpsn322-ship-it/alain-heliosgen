import { NextRequest, NextResponse } from "next/server";
import { checkInternalAuth } from "@/lib/internalAuth";
import { jobStore } from "@/lib/jobStore";
import { normalizeJob, recoverJob } from "@/lib/jobRecovery";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const auth = checkInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { taskId } = await ctx.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });

  const local = jobStore.get(taskId);
  if (local) {
    const norm = normalizeJob(taskId, local);
    return NextResponse.json(norm ?? { taskId, status: "pending" });
  }

  const recovered = await recoverJob(taskId).catch(() => "not_found" as const);
  if (recovered === "done" || recovered === "error") {
    return NextResponse.json(normalizeJob(taskId, jobStore.get(taskId)) ?? { taskId, status: recovered });
  }
  if (recovered === "pending") {
    return NextResponse.json({ taskId, status: "pending" });
  }
  return NextResponse.json({ taskId, status: "error", error: "not_found" }, { status: 404 });
}
