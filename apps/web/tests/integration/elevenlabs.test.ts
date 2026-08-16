import { describe, it, expect } from "vitest";

// Live ElevenLabs integration test.
// Run with: RUN_LIVE=1 ELEVENLABS_API_KEY=... pnpm test tests/integration/elevenlabs.test.ts
//
// It lists every voice on the account via GET /v1/voices, picks candidate "free"
// voices (any voice that is NOT a library/premade voice — i.e. one you created,
// which free plans are allowed to use via the API), then synthesizes speech with
// the first one that works.
//
// If no custom voice exists yet, create one in the ElevenLabs dashboard
// (Add Voice -> Instant Voice Clone / Generative); it will appear in GET /v1/voices
// and can be used on the free plan. Its id can be set as ELEVENLABS_VOICE_ID.

const API_KEY = process.env.ELEVENLABS_API_KEY;
const runLive = process.env.RUN_LIVE === "1" && Boolean(API_KEY);
const BASE = "https://api.elevenlabs.io/v1";

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
}

// Populated by the list test, consumed by the TTS test (vitest runs in order).
let candidateVoices: Voice[] = [];

describe.skipIf(!runLive)("ElevenLabs live integration", () => {
  it("lists voices and selects free (non-library) candidates", async () => {
    const res = await fetch(`${BASE}/voices`, { headers: { "xi-api-key": API_KEY! } });
    expect(res.ok, `GET /v1/voices failed: ${res.status}`).toBe(true);

    const data = (await res.json()) as { voices?: Voice[] };
    const voices = data.voices ?? [];
    console.log(`ElevenLabs: found ${voices.length} voices`);
    for (const v of voices) {
      console.log(`  - ${v.voice_id}  "${v.name}"  [${v.category ?? "unknown"}]`);
    }

    const ownedIds = new Set(voices.map((v) => v.voice_id));
    const envVoice = process.env.ELEVENLABS_VOICE_ID;
    const envOwned = envVoice && ownedIds.has(envVoice) ? envVoice : undefined;

    candidateVoices =
      (envOwned ? [voices.find((v) => v.voice_id === envOwned)!] : []).concat(
        voices.filter((v) => v.category && v.category !== "premade"),
      );

    if (candidateVoices.length) {
      console.log(`Candidate free voices: ${candidateVoices.map((v) => v.voice_id).join(", ")}`);
    } else {
      console.log(
        "No custom (non-library) voice found. Free plans cannot use library/premade voices via the " +
          "API (402 paid_plan_required). Create a voice in the ElevenLabs dashboard and set ELEVENLABS_VOICE_ID.",
      );
    }
    expect(Array.isArray(voices)).toBe(true);
  });

  it("synthesizes speech with the first usable candidate voice", async () => {
    if (!candidateVoices.length) {
      console.log("Skipping TTS: no candidate free voice on this account (see guidance above).");
      return;
    }

    for (const v of candidateVoices) {
      const res = await fetch(`${BASE}/text-to-speech/${v.voice_id}`, {
        method: "POST",
        headers: { "xi-api-key": API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello from DogeVault Stylist, your premium pet stylist.",
          model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
          output_format: "mp3_44100_128",
        }),
      });

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`TTS OK: ${buf.length} bytes of audio for voice ${v.voice_id} (${v.name})`);
        expect(buf.length).toBeGreaterThan(0);
        return;
      }

      const body = await res.text().catch(() => "");
      if (res.status === 402) {
        console.log(`Voice ${v.voice_id} blocked (paid_plan_required); trying next candidate.`);
        continue;
      }
      expect(res.ok, `TTS failed unexpectedly: ${res.status} ${body}`).toBe(true);
    }

    console.log(
      "All candidate voices were blocked by the free plan (402). Create a custom voice in the " +
        "ElevenLabs dashboard to use the API for free; this is expected behavior without one.",
    );
  });
});
