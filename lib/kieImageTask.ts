import { ensureR2 } from "@/lib/r2";
import { IMAGE_MODELS } from "@/lib/modelConfig";

const BASE = "https://api.kie.ai";
const CREATE = `${BASE}/api/v1/jobs/createTask`;

export class KieImageTaskError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "KieImageTaskError";
  }
}

export async function resolveImages(imageUrls: string[]): Promise<string[]> {
  const resolved = await Promise.all(
    imageUrls.slice(0, 14).map((u) => ensureR2(u, "references").catch(() => null)),
  );
  return resolved.filter((u): u is string => u !== null);
}

export interface KieImageTaskInput {
  model: string;
  prompt: string;
  r2ImageUrls?: string[];
  aspectRatio?: string;
  quality?: string;
  kieToken: string;
  callbackUrl: string;
}

export interface KieImageTaskResult {
  taskId: string;
  referenceImageUrls: string[];
}

export function isKnownImageModel(model: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === model);
}

export async function createKieImageTask(opts: KieImageTaskInput): Promise<KieImageTaskResult> {
  const { model, prompt, kieToken, callbackUrl } = opts;
  const aspectRatio = opts.aspectRatio ?? "1:1";
  const quality = opts.quality ?? "1k";
  const r2ImageUrls = opts.r2ImageUrls ?? [];

  if (!prompt?.trim()) throw new KieImageTaskError("Prompt is required", 400);
  if (!kieToken) throw new KieImageTaskError("kie.ai token missing", 401);
  if (!callbackUrl) throw new KieImageTaskError("callbackUrl missing", 500);

  const cfg = IMAGE_MODELS.find((m) => m.id === model);
  if (!cfg) throw new KieImageTaskError(`Unknown model: ${model}`, 400);

  const { apiInput } = cfg;
  const hasImages = r2ImageUrls.length > 0;
  const resolvedApiId = !hasImages && cfg.textOnlyApiId ? cfg.textOnlyApiId : cfg.apiId;

  const input: Record<string, unknown> = {
    prompt: prompt.slice(0, apiInput.promptMaxLength),
    [apiInput.aspectRatioKey]: aspectRatio,
  };
  if (apiInput.outputFormat) input.output_format = apiInput.outputFormat;
  if (apiInput.imageInputKey && hasImages) {
    input[apiInput.imageInputKey] = r2ImageUrls.slice(0, cfg.maxImages);
  }
  if (apiInput.qualityKey) {
    input[apiInput.qualityKey] = apiInput.qualityMap
      ? (apiInput.qualityMap[quality] ?? quality)
      : quality === "4k" ? "4K" : quality === "2k" ? "2K" : quality === "1k" ? "1K" : quality;
  }
  if (apiInput.extra) Object.assign(input, apiInput.extra);

  const requestBody = { model: resolvedApiId, callBackUrl: callbackUrl, input };

  const res = await fetch(CREATE, {
    method: "POST",
    headers: { Authorization: `Bearer ${kieToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    if (res.status === 401) throw new KieImageTaskError("Invalid kie.ai API key.", 401);
    throw new KieImageTaskError((await res.text()) || `kie.ai HTTP ${res.status}`, 502);
  }

  const d = await res.json();
  if (d.code !== undefined && d.code !== 200) {
    throw new KieImageTaskError(d.msg ?? `kie.ai error ${d.code}`, 502);
  }

  const taskId = d.data?.taskId ?? d.data?.id ?? d.taskId ?? d.id;
  if (!taskId) throw new KieImageTaskError("No task ID in kie.ai response", 502);

  return { taskId: String(taskId), referenceImageUrls: r2ImageUrls };
}
