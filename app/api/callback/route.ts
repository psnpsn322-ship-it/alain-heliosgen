import { after, NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/jobStore";
import { jobEvents } from "@/lib/jobEvents";
import { mirrorToR2 } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GUEST_MODE } from "@/lib/guestMode";
import * as guestDb from "@/lib/guest/db";

function extractUrls(resultJson?: string): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson);
    const urls = parsed.resultUrls ?? parsed.resultUrl;
    if (Array.isArray(urls)) return urls.filter(Boolean);
    if (urls) return [urls];
    return [];
  } catch {
    return [];
  }
}

function settle(taskId: string, result: Parameters<typeof jobStore.set>[1]) {
  jobStore.set(taskId, result);
  jobEvents.emit(`job:${taskId}`, result);
}

export const maxDuration = 300;

async function isVideoTask(taskId: string): Promise<boolean> {
  const inMemory = jobStore.get(taskId);
  if (inMemory?.status === "pending" && (inMemory as { type?: string }).type === "video") {
    return true;
  }
  if (GUEST_MODE) return false;

  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("generation_type")
    .eq("task_id", taskId)
    .maybeSingle();

  if (error) console.error("[callback] generation type lookup failed:", error.message);
  return data?.generation_type === "video";
}

async function persistDone(taskId: string, isVideo: boolean, urls: string[]) {
  if (GUEST_MODE) {
    guestDb.updateGeneration(
      taskId,
      isVideo
        ? { status: "done", video_url: urls[0] }
        : { status: "done", image_url: urls[0], image_urls: urls },
    );
    return;
  }

  const values = isVideo
    ? { status: "done", video_url: urls[0] }
    : { status: "done", image_url: urls[0], image_urls: urls };
  const { error } = await supabaseAdmin.from("generations").update(values).eq("task_id", taskId);
  if (error) console.error("[callback] supabase update failed:", error.message);
}

async function persistError(taskId: string, errorMessage: string) {
  if (GUEST_MODE) {
    guestDb.updateGeneration(taskId, { status: "error", error_msg: errorMessage });
    return;
  }

  const { error } = await supabaseAdmin
    .from("generations")
    .update({ status: "error", error_msg: errorMessage })
    .eq("task_id", taskId);
  if (error) console.error("[callback] supabase error update failed:", error.message);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("[callback] received:", JSON.stringify(body, null, 2));

  const data   = body.data ?? body;
  const taskId = data.taskId ?? data.id ?? body.taskId ?? body.id;
  const state  = String(data.state ?? data.status ?? "").toLowerCase();

  console.log("[callback] taskId:", taskId, "state:", state);

  if (!taskId) {
    console.log("[callback] could not extract taskId");
    return NextResponse.json({ received: true });
  }

  // Treat a non-200 top-level code as a hard error (e.g. Veo 500 responses that
  // carry no state/status field but do carry body.code and body.msg).
  if (body.code !== undefined && body.code !== 200) {
    const error = data.failMsg ?? body.msg ?? "Generation failed";
    console.log("[callback] top-level error code:", body.code, error);
    settle(taskId, { status: "error", error });
    await persistError(taskId, error);
    return NextResponse.json({ received: true });
  }

  if (state === "success") {
    let kieUrls = extractUrls(data.resultJson);
    if (kieUrls.length === 0 && data.videoUrl) kieUrls = [data.videoUrl];
    if (kieUrls.length === 0 && (data.output?.[0] ?? data.output)) {
      kieUrls.push(data.output?.[0] ?? data.output);
    }

    if (kieUrls.length > 0) {
      const video = await isVideoTask(taskId);
      const sourceResult = video
        ? { status: "done" as const, videoUrl: kieUrls[0] }
        : { status: "done" as const, imageUrl: kieUrls[0], imageUrls: kieUrls };

      // Persist the provider URLs before acknowledging the callback. This keeps
      // polling/history reliable even if R2 mirroring is slow or unavailable.
      settle(taskId, sourceResult);
      await persistDone(taskId, video, kieUrls);

      // Next.js after() keeps the Vercel function alive after the HTTP response,
      // so R2 mirroring is not abandoned when the callback returns.
      after(async () => {
        try {
          const folder = video ? "videos" : "images";
          const storedUrls = await Promise.all(kieUrls.map((url) => mirrorToR2(url, folder)));
          const storedResult = video
            ? { status: "done" as const, videoUrl: storedUrls[0] }
            : { status: "done" as const, imageUrl: storedUrls[0], imageUrls: storedUrls };
          settle(taskId, storedResult);
          await persistDone(taskId, video, storedUrls);
        } catch (error) {
          console.error(
            "[callback] storage upload failed, keeping provider URLs:",
            error instanceof Error ? error.message : error,
          );
        }
      });
    } else {
      console.log("[callback] success but no URL found in resultJson");
    }
  } else if (state === "fail" || state === "failed" || state === "error") {
    const error = data.failMsg ?? data.error ?? body.msg ?? "Generation failed";
    settle(taskId, { status: "error", error });
    await persistError(taskId, error);
  } else {
    console.log("[callback] intermediate state, ignoring:", state);
  }

  return NextResponse.json({ received: true });
}
