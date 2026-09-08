const KIE_BASE = "https://api.kie.ai";
const CREATE_URL = `${KIE_BASE}/api/v1/jobs/createTask`;
const STATUS_URL = `${KIE_BASE}/api/v1/jobs/recordInfo`;

export class KieError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "KieError";
  }
}

export async function createNanoBananaTask(args: {
  prompt: string;
  aspectRatio?: string;
  quality?: string;
  callbackUrl: string;
  apiKey: string;
}): Promise<{ taskId: string }> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new KieError("Prompt is required.", 400);

  const body = {
    model: "nano-banana-2",
    callBackUrl: args.callbackUrl,
    input: {
      prompt: prompt.slice(0, 10000),
      aspect_ratio: args.aspectRatio ?? "4:5",
      quality: (args.quality ?? "1k") === "1k" ? "basic" : "high",
      output_format: "jpg",
    },
  };

  const res = await fetch(CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) throw new KieError("Invalid kie.ai API key.", 401);
    throw new KieError((await res.text()) || `kie.ai HTTP ${res.status}`);
  }

  const json = (await res.json()) as any;
  if (json.code !== undefined && json.code !== 200) {
    throw new KieError(json.msg ?? `kie.ai error ${json.code}`);
  }
  const taskId = json.data?.taskId ?? json.data?.id ?? json.taskId ?? json.id;
  if (!taskId) throw new KieError("No task ID in kie.ai response.");
  return { taskId: String(taskId) };
}

function parseResultUrls(raw: unknown): string[] {
  if (!raw) return [];
  let value: any = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return /^https?:\/\//.test(value) ? [value] : []; }
  }
  const urls = value?.resultUrls ?? value?.result_urls ?? value?.urls ?? value?.output?.resultUrls ?? [];
  if (Array.isArray(urls)) return urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  const one = value?.resultUrl ?? value?.result_url ?? value?.url;
  return typeof one === "string" && /^https?:\/\//.test(one) ? [one] : [];
}

export async function getKieTask(taskId: string, apiKey: string): Promise<{
  status: "pending" | "done" | "error";
  urls?: string[];
  error?: string;
}> {
  const res = await fetch(`${STATUS_URL}?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) throw new KieError("Invalid kie.ai API key.", 401);
    throw new KieError((await res.text()) || `kie.ai HTTP ${res.status}`);
  }

  const json = (await res.json()) as any;
  if (json.code !== undefined && json.code !== 200) {
    throw new KieError(json.msg ?? `kie.ai error ${json.code}`);
  }

  const data = json.data ?? json;
  const state = String(data.state ?? data.status ?? data.taskStatus ?? "").toLowerCase();
  const urls = parseResultUrls(data.resultJson ?? data.result ?? data.output);

  if (["success", "succeeded", "done", "completed"].includes(state) || urls.length > 0) {
    return { status: "done", urls };
  }
  if (["fail", "failed", "error", "cancelled", "canceled"].includes(state)) {
    return { status: "error", error: data.failMsg ?? data.error ?? data.message ?? "Generation failed." };
  }
  return { status: "pending" };
}
