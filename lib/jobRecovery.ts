import { jobStore, type JobResult } from "@/lib/jobStore";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GUEST_MODE } from "@/lib/guestMode";
import * as guestDb from "@/lib/guest/db";

export async function recoverJob(
  taskId: string,
): Promise<"done" | "error" | "pending" | "not_found"> {
  if (GUEST_MODE) {
    const gen = guestDb.recoverJob(taskId);
    if (!gen) return "not_found";
    if (gen.status === "done") {
      jobStore.set(
        taskId,
        gen.video_url
          ? { status: "done", videoUrl: gen.video_url }
          : { status: "done", imageUrl: gen.image_url ?? undefined, imageUrls: gen.image_urls ?? undefined },
      );
      return "done";
    }
    if (gen.status === "error") {
      jobStore.set(taskId, { status: "error", error: gen.error_msg ?? "Generation failed" });
      return "error";
    }
    return "pending";
  }

  const { data: gen } = await supabaseAdmin
    .from("generations")
    .select("status, video_url, image_url, image_urls, error_msg")
    .eq("task_id", taskId)
    .single();

  if (!gen) return "not_found";

  if (gen.status === "done") {
    jobStore.set(
      taskId,
      gen.video_url
        ? { status: "done", videoUrl: gen.video_url }
        : { status: "done", imageUrl: gen.image_url, imageUrls: gen.image_urls },
    );
    return "done";
  }
  if (gen.status === "error") {
    jobStore.set(taskId, { status: "error", error: gen.error_msg ?? "Generation failed" });
    return "error";
  }
  return "pending";
}

export type NormalizedAssetType = "image" | "video";

export interface NormalizedJob {
  taskId: string;
  status: "pending" | "done" | "error";
  asset?: { url: string; type: NormalizedAssetType };
  assets?: { url: string; type: NormalizedAssetType }[];
  error?: string;
}

export function normalizeJob(taskId: string, r: JobResult | undefined | null): NormalizedJob | null {
  if (!r) return null;
  if (r.status === "pending") return { taskId, status: "pending" };
  if (r.status === "error") return { taskId, status: "error", error: r.error };

  if (r.videoUrl) {
    const a = { url: r.videoUrl, type: "video" as const };
    return { taskId, status: "done", asset: a, assets: [a] };
  }
  const urls = (r.imageUrls && r.imageUrls.length ? r.imageUrls : r.imageUrl ? [r.imageUrl] : []).filter(Boolean);
  const assets = urls.map((url) => ({ url, type: "image" as const }));
  return { taskId, status: "done", asset: assets[0], assets };
}
