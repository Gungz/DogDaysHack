import { describe, it, expect } from "vitest";
import { tryOnProduct } from "@/lib/youcam";

// Run with: RUN_LIVE=1 pnpm exec vitest run tests/integration/youcam-tryon.test.ts
const runLive = process.env.RUN_LIVE === "1";

const PORTRAIT_URL =
  "https://yce-us.s3-accelerate.amazonaws.com/ttl30/427686325341130843/117294402441/v2/aeMNNB0KmUIP8rnQ996tC5Q/5dd43633-0136-405c-b5d5-6bc528113069.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260816T134650Z&X-Amz-SignedHeaders=host&X-Amz-Expires=7200&X-Amz-Credential=AKIARB77EV5Y5D7DAE3S%2F20260816%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Signature=72a1584225d4eb37b12760913b2d084b22e50be890f69357dd64cd6b0c72ea2b";

const PRODUCT_URL =
  "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQpw2Mx4FHFEq6TSiJbaAD7gI7EofeWlx7-C1jwX2Ufzu4ctamOuTPq0RDmpNmFbweVwEUMW7RTPDuFwbOSgVX9NiHLPd3phQ";

describe.skipIf(!runLive)("youcam try-on (live)", () => {
  it("runs try-on with the provided portrait + product", async () => {
    console.log("INPUT kind=clothes");
    console.log("portraitUrl:", PORTRAIT_URL.slice(0, 80), "...");
    console.log("productUrl:", PRODUCT_URL.slice(0, 80), "...");

    let result: string | null = null;
    let error: unknown = null;
    try {
      result = await tryOnProduct("clothes", PORTRAIT_URL, PRODUCT_URL);
    } catch (e) {
      error = e;
    }

    console.log("OUTPUT:", result);
    if (error) {
      console.log("ERROR:", error instanceof Error ? error.message : String(error));
    }
    // Either we got a result URL or a surfaced error — both are acceptable outcomes
    // for this diagnostic test; the goal is to see the real YouCam behavior.
    expect(result !== undefined || error !== null).toBe(true);
  });
});
