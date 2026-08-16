import { NextRequest, NextResponse } from "next/server";
import { buildNftMetadata, storeNftMetadata } from "@/lib/supabase";
import type { DogProfile, Product } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dogProfile, product, enhancedImageUrl, txSignature } = body as {
      dogProfile?: DogProfile;
      product?: Product;
      enhancedImageUrl?: string;
      txSignature?: string;
    };

    if (!dogProfile || !product) {
      return NextResponse.json(
        { error: "Missing dogProfile or product" },
        { status: 400 },
      );
    }

    const meta = buildNftMetadata({
      dogProfile,
      product,
      enhancedImageUrl: enhancedImageUrl || "",
      txSignature,
    });

    const { uri, stored } = await storeNftMetadata(meta);
    return NextResponse.json({ metadataUri: uri, stored });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
