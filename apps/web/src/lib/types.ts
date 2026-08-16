export type DogProfile = {
  breedGuess: string;
  size: "small" | "medium" | "large" | "unknown";
  vibe: string;
  colorPalette: string[];
  stylistSummary: string;
  voiceScript: string;
  productQueries: string[];
  subjectType: "dog" | "human" | "unknown";
};

export type ProductCategory = "clothes" | "shoes" | "hat" | "unknown";

export type Product = {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  priceText?: string;
  priceAmount?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  source: string;
  queryUsed: string;
  category?: ProductCategory;
};

export type AgentStepStatus = "start" | "done" | "error";

export type AgentStep = {
  name: string;
  label: string;
  status: AgentStepStatus;
  detail?: string;
};

export type AgentResult = {
  originalImageUrl: string;
  enhancedImageUrl: string | null;
  tryOnImageUrl?: string | null;
  dogProfile: DogProfile;
  products: Product[];
  providerStatus: {
    youcam: "ok" | "missing_key" | "error";
    gemini: "ok" | "missing_key" | "error";
    apify: "ok" | "missing_key" | "error";
  };
  notes: string[];
};

export type SolanaClientConfig = {
  rpcUrl: string;
  cluster: string;
  programId: string;
  usdcMint: string;
  treasury: string;
};