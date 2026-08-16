import { NextResponse } from "next/server";
import { tryOnProduct, type TryOnKind } from "@/lib/youcam";
import { generateDogTryOn } from "@/lib/geminiTryOn";

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

    const result = await generateDogTryOn({
      dogImage: { buffer: Buffer.from(await (await fetch(srcImageUrl)).arrayBuffer()), contentType: "image/jpeg" },
      product: { imageUrl: refImageUrl, title: body.title || "product", kind },
    });
    if (!result.url) {
      return NextResponse.json({ error: result.note || "Dog try-on failed", status: result.status }, { status: result.status === "image_gen_unavailable" ? 409 : 502 });
    }
    return NextResponse.json({ url: result.url, engine: "gemini" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Try-on failed" }, { status: 500 });
  }
}
