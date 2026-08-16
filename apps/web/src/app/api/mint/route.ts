import { NextResponse } from "next/server";
import { mintCnftReceipt } from "@/lib/nft";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { metadataUri, name, owner } = body as {
      metadataUri?: string;
      name?: string;
      owner?: string;
    };

    if (!metadataUri) {
      return NextResponse.json({ error: "Missing metadataUri" }, { status: 400 });
    }

    const result = mintCnftReceipt({
      metadataUri,
      name: name || "DogeVault Receipt",
      owner,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mint failed" },
      { status: 500 },
    );
  }
}
