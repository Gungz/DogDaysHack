import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { getServerEnv } from "@/lib/env";
import { debugStep } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.elevenLabsApiKey || !env.elevenLabsVoiceId) {
    return Response.json({ error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID", code: "missing_key" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) return Response.json({ error: "Missing text" }, { status: 400 });

    debugStep("elevenlabs:tts:start", { voiceId: env.elevenLabsVoiceId, textLength: text.length });
    const client = new ElevenLabsClient({ apiKey: env.elevenLabsApiKey });
    const audioStream = await client.textToSpeech.convert(env.elevenLabsVoiceId, {
      text,
      modelId: env.elevenLabsModelId,
      outputFormat: "mp3_44100_128",
    });
    const audio = await streamToBuffer(audioStream);
    debugStep("elevenlabs:tts:success", { bytes: audio.length });

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ElevenLabs voice generation failed";
    // Free ElevenLabs plans cannot use library voices via the API (402 paid_plan_required).
    // The client should fall back to the browser's built-in SpeechSynthesis in that case.
    const paidPlanRequired = /paid_plan_required|payment_required|402/i.test(message);
    debugStep("elevenlabs:tts:error", { message, paidPlanRequired });
    return Response.json(
      { error: message, code: paidPlanRequired ? "paid_plan_required" : "error" },
      { status: paidPlanRequired ? 402 : 500 },
    );
  }
}