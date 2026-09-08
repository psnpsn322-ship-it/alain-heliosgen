import { NextRequest, NextResponse } from "next/server";
import { checkInternalAuth, internalKieKey } from "@/lib/internalAuth";
import { createKieImageTask, resolveImages, KieImageTaskError } from "@/lib/kieImageTask";
import { jobStore } from "@/lib/jobStore";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GUEST_MODE } from "@/lib/guestMode";
import * as guestDb from "@/lib/guest/db";
import { POST as generateVideoPOST } from "@/app/api/generate-video/route";

export const maxDuration = 1000;

const DEFAULT_IMAGE_MODEL = "nano-banana-2";
const DEFAULT_IMAGE_ASPECT = "4:5";
const DEFAULT_VIDEO_MODEL = "kling-3.0";

interface InternalBody {
  medium?: "image" | "video";
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  quality?: string;
  duration?: number;
  references?: string[];
  metadata?: {
    source?: string;
    productId?: string;
    briefId?: string;
    angleId?: string;
  };
}

export async function POST(req: NextRequest) {
  const auth = checkInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: InternalBody;
  try {
    body = (await req.json()) as InternalBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const medium = body.medium;
  if (medium !== "image" && medium !== "video") {
    return NextResponse.json({ error: "medium must be 'image' or 'video'." }, { status: 400 });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const kieKey = internalKieKey();
  if (!kieKey) {
    return NextResponse.json(
      { error: "Internal kie.ai key not configured (HELIOS_ECOM_KIE_API_KEY / KIE_API_KEY)." },
      { status: 503 },
    );
  }

  const callbackBase = process.env.CALLBACK_BASE_URL;
  if (!callbackBase) {
    return NextResponse.json({ error: "CALLBACK_BASE_URL is not set." }, { status: 503 });
  }
  const callbackUrl = `${callbackBase.replace(/\/$/, "")}/api/callback`;

  const refs = (body.references ?? []).filter((u) => typeof u === "string" && /^https?:|^data:/.test(u));
  const meta = body.metadata ?? {};

  if (medium === "image") {
    const model = body.model ?? DEFAULT_IMAGE_MODEL;
    try {
      const r2ImageUrls = refs.length ? await resolveImages(refs).catch(() => []) : [];
      const { taskId, referenceImageUrls } = await createKieImageTask({
        model,
        prompt: body.prompt,
        r2ImageUrls,
        aspectRatio: body.aspectRatio ?? DEFAULT_IMAGE_ASPECT,
        quality: body.quality ?? "1k",
        kieToken: kieKey,
        callbackUrl,
      });

      jobStore.set(taskId, { status: "pending", type: "image" });
      recordPending({
        taskId,
        type: "image",
        prompt: body.prompt,
        model,
        aspectRatio: body.aspectRatio ?? DEFAULT_IMAGE_ASPECT,
        quality: body.quality ?? "1k",
        referenceUrls: referenceImageUrls,
        meta,
      });

      return NextResponse.json({ taskId, status: "pending" });
    } catch (e) {
      const status = e instanceof KieImageTaskError ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed." }, { status });
    }
  }

  const videoReq = new NextRequest("http://internal.local/api/generate-video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: body.model ?? DEFAULT_VIDEO_MODEL,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio ?? "9:16",
      duration: typeof body.duration === "number" ? body.duration : 5,
      imageUrls: refs,
      callBackUrl: callbackUrl,
      __internal: true,
    }),
  });

  const res = await generateVideoPOST(videoReq);
  const json = (await res.json().catch(() => ({}))) as { taskId?: string; error?: string };
  if (!res.ok || !json.taskId) {
    return NextResponse.json({ error: json.error ?? "Video generation failed." }, { status: res.status || 502 });
  }
  return NextResponse.json({ taskId: json.taskId, status: "pending" });
}

function recordPending(args: {
  taskId: string;
  type: "image" | "video";
  prompt: string;
  model: string;
  aspectRatio: string;
  quality: string;
  referenceUrls: string[];
  meta: NonNullable<InternalBody["metadata"]>;
}) {
  const row = {
    task_id: args.taskId,
    user_id: null as string | null,
    generation_type: args.type,
    status: "pending" as const,
    prompt: args.prompt.slice(0, 2000),
    model: args.model,
    aspect_ratio: args.aspectRatio,
    quality: args.quality,
    reference_image_urls: args.referenceUrls,
    source: args.meta.source ?? "ecom-os",
    ext_product_id: args.meta.productId ?? null,
    ext_brief_id: args.meta.briefId ?? null,
    ext_angle_id: args.meta.angleId ?? null,
  };
  try {
    if (GUEST_MODE) {
      guestDb.insertGeneration(row as never);
    } else {
      supabaseAdmin
        .from("generations")
        .insert(row)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.error("[internal/generate] supabase insert error:", error.message);
        });
    }
  } catch (e) {
    console.error("[internal/generate] recordPending failed:", e instanceof Error ? e.message : e);
  }
}
