import { NextResponse } from "next/server";
import { machineKieKey, publicBaseUrl, requireInternalAuth } from "@/lib/auth";
import { createNanoBananaTask, KieError } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  medium?: "image" | "video";
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  quality?: string;
  metadata?: {
    source?: string;
    productId?: string;
    briefId?: string;
    angleId?: string;
  };
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.medium !== "image") {
    return NextResponse.json({ error: "Bridge Lite V1 supports image generation only." }, { status: 400 });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }
  if (body.model && body.model !== "nano-banana-2") {
    return NextResponse.json({ error: "Bridge Lite V1 only supports nano-banana-2." }, { status: 400 });
  }

  const apiKey = machineKieKey();
  if (!apiKey) {
    return NextResponse.json({ error: "HELIOS_ECOM_KIE_API_KEY is not configured." }, { status: 503 });
  }
  const baseUrl = publicBaseUrl(req);
  if (!baseUrl) {
    return NextResponse.json({ error: "Public bridge URL could not be resolved." }, { status: 503 });
  }

  try {
    const { taskId } = await createNanoBananaTask({
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      quality: body.quality,
      callbackUrl: `${baseUrl}/api/callback`,
      apiKey,
    });
    return NextResponse.json({ taskId, status: "pending" });
  } catch (error) {
    const status = error instanceof KieError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
