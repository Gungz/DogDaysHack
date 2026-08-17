import { getServerEnv } from "./env";
import { debugStep } from "./log";

type YouCamFileResult = {
  fileId: string;
};

const YOUCAM_TIMEOUT_MS = 30_000;

async function youcamFetch<T>(path: string, init: RequestInit): Promise<T> {
  const env = getServerEnv();
  if (!env.youcamApiKey) throw new Error("Missing YOUCAM_API_KEY");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUCAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.youcamBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.youcamApiKey}`,
        ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = data?.error || data?.error_code || response.statusText;
      throw new Error(`YouCam request failed: ${response.status} ${String(message)}`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`YouCam request timed out after ${YOUCAM_TIMEOUT_MS}ms (${path})`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadDogImage(fileName: string, contentType: string, bytes: Buffer): Promise<YouCamFileResult> {
  const initResponse = await youcamFetch<{
    data: {
      files: Array<{
        file_id: string;
        requests: Array<{ method: string; url: string; headers: Record<string, string> }>;
      }>;
    };
  }>("/s2s/v2.0/file", {
    method: "POST",
    body: JSON.stringify({
      files: [
        {
          content_type: contentType,
          file_name: fileName,
          file_size: bytes.byteLength,
        },
      ],
    }),
  });

  const uploaded = initResponse.data.files[0];
  const upload = uploaded?.requests?.[0];
  if (!uploaded?.file_id || !upload?.url) throw new Error("YouCam did not return a file upload URL");

  const uploadController = new AbortController();
  const uploadTimer = setTimeout(() => uploadController.abort(), YOUCAM_TIMEOUT_MS);
  try {
    const uploadResponse = await fetch(upload.url, {
      method: upload.method || "PUT",
      headers: upload.headers || { "Content-Type": contentType },
      body: new Blob([new Uint8Array(bytes)], { type: contentType }),
      signal: uploadController.signal,
    });
    if (!uploadResponse.ok) {
      throw new Error(`YouCam direct upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`YouCam direct upload timed out after ${YOUCAM_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(uploadTimer);
  }

  return { fileId: uploaded.file_id };
}

async function runYouCamTask(taskPath: string, body: Record<string, unknown>): Promise<string | null> {
  debugStep(`youcam:task:${taskPath}:start`, body);
  const started = await youcamFetch<{ data?: { task_id?: string } }>(`/s2s/v2.0/task/${taskPath}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = started.data?.task_id;
  if (!taskId) throw new Error(`YouCam ${taskPath} did not return a task_id`);

  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const status = await youcamFetch<{
      data?: {
        task_status?: "running" | "success" | "error";
        results?: { url?: string };
        error?: string | null;
        error_message?: string;
      };
    }>(`/s2s/v2.0/task/${taskPath}/${encodeURIComponent(taskId)}`, { method: "GET" });

    const taskStatus = status.data?.task_status;
    if (taskStatus === "success") {
      const url = status.data?.results?.url ?? null;
      debugStep(`youcam:task:${taskPath}:success`, { taskId }, url);
      return url;
    }
    if (taskStatus === "error") {
      throw new Error(status.data?.error_message || status.data?.error || `YouCam ${taskPath} failed`);
    }
  }

  throw new Error(`YouCam ${taskPath} timed out`);
}

export async function enhanceDogPortrait(fileId: string) {
  try {
    return await runYouCamTask("enhance", { src_file_id: fileId, scale: 1 });
  } catch {
    return null;
  }
}

export async function replaceDogBackground(fileId: string) {
  try {
    return await runYouCamTask("bg-replace", {
      src_file_id: fileId,
      type: "prompt",
      prompt:
        "A clean luxury pet studio portrait background, soft warm lighting, neutral backdrop, subtle depth of field, product photography style, centered subject, no humans",
    });
  } catch {
    return null;
  }
}

export type TryOnKind = "clothes" | "hat" | "shoes";

const TRYON_TASK_PATH: Record<TryOnKind, string> = {
  clothes: "cloth-v3",
  hat: "hat",
  shoes: "shoes",
};

export async function tryOnProduct(
  kind: TryOnKind,
  srcFileUrl: string,
  refFileUrl: string,
): Promise<string | null> {
  const taskPath = TRYON_TASK_PATH[kind];
  const body: Record<string, unknown> = {
    src_file_url: srcFileUrl,
    ref_file_url: refFileUrl,
  };
  if (kind === "clothes") {
    body.garment_category = "auto";
  } else {
    body.gender = "female";
    body.style = "random";
  }
  debugStep(`youcam:tryon:${taskPath}:start`, body);
  // Errors are intentionally propagated (not swallowed) so callers can surface the
  // real failure reason. runYouCamTask only returns null when the task succeeded but
  // produced no result URL.
  const url = await runYouCamTask(taskPath, body);
  debugStep(`youcam:tryon:${taskPath}:done`, { url });
  return url;
}