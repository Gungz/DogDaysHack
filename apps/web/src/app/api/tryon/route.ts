import { NextResponse } from "next/server";
import { tryOnProduct, type TryOnKind } from "@/lib/youcam";
import { generateDogTryOn } from "@/lib/dogTryOn";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { srcImageUrl, refImageUrl, kind, subjectType } = body as {
      srcImageUrl?: string;
      refImageUrl?: string;
      kind?: TryOnKind;
      subjectType?: "dog" | "human" | "unknown";
    };

    if (!srcImageUrl || !refImageUrl || !kind) {
      return NextResponse.json({ error: "Missing srcImageUrl, refImageUrl, or kind" }, { status: 400 });
    }

    // Hybrid routing: YouCam is human-only, so a dog subject uses Gemini image generation.
    const isHuman = subjectType === "human";

    if (isHuman) {
      if (!process.env.YOUCAM_API_KEY) {
        return NextResponse.json({ error: "Missing YOUCAM_API_KEY" }, { status: 400 });
      }
      try {
        const url = await tryOnProduct(kind, srcImageUrl, refImageUrl);
        if (!url) return NextResponse.json({ error: "YouCam virtual try-on failed" }, { status: 502 });
        return NextResponse.json({ url, engine: "youcam" });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "YouCam try-on failed" }, { status: 502 });
      }
    }

    const srcController = new AbortController();
    const srcTimer = setTimeout(() => srcController.abort(), 20_000);
    let srcBytes: Buffer;
    try {
      const srcRes = await fetch(srcImageUrl, { signal: srcController.signal });
      if (!srcRes.ok) throw new Error(`Source image fetch failed: ${srcRes.status}`);
      srcBytes = Buffer.from(await srcRes.arrayBuffer());
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json({ error: "Source image fetch timed out" }, { status: 504 });
      }
      return NextResponse.json({ error: error instanceof Error ? error.message : "Source image fetch failed" }, { status: 502 });
    } finally {
      clearTimeout(srcTimer);
    }

    const result = await generateDogTryOn({
      dogImage: { buffer: srcBytes, contentType: "image/jpeg" },
      product: { imageUrl: refImageUrl, title: body.title || "product", kind },
    });
    if (!result.url) {
      return NextResponse.json({ error: result.note || "Dog try-on failed", status: result.status }, { status: result.status === "image_gen_unavailable" ? 409 : 502 });
    }
    return NextResponse.json({ url: result.url, engine: "gemini" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Try-on failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
