import { runDogAgent } from "@/lib/agent";
import type { AgentResult, AgentStep } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const stream = url.searchParams.get("stream") === "1";

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    if (stream) {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encodeSSE({ type: "error", message: "Missing dog image field: image" }));
          controller.close();
        },
      });
      return new Response(body, { headers: sseHeaders() });
    }
    return Response.json({ error: "Missing dog image field: image" }, { status: 400 });
  }

  if (!stream) {
    try {
      const result = await runDogAgent(file);
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Agent run failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        const result: AgentResult = await runDogAgent(file, (step: AgentStep) => send({ type: "step", step }));
        send({ type: "result", result });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Agent run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: sseHeaders() });
}

function encodeSSE(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}
