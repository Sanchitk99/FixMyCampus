import mongoose from "mongoose";

/**
 * Options tuned for both local `mongodb://` and Atlas `mongodb+srv://`.
 * TLS errors during seed/connect usually mean: wrong Atlas IP allowlist,
 * password special chars not URL-encoded, paused cluster, or proxy/VPN SSL inspection.
 */
export function getMongoOptions() {
  const uri = process.env.MONGODB_URI || "";
  const opts = {
    serverSelectionTimeoutMS: 20000,
  };
  if (uri.startsWith("mongodb+srv")) {
    opts.retryWrites = true;
    opts.w = "majority";
  }
  // Dev-only escape hatch if TLS fails due to corporate proxy / SSL inspection (never enable in production).
  if (process.env.MONGODB_TLS_INSECURE === "true") {
    opts.tlsAllowInvalidCertificates = true;
    console.warn(
      "[MongoDB] MONGODB_TLS_INSECURE=true — certificate validation is off; use only for local debugging."
    );
  }
  return opts;
}

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(uri, getMongoOptions());
};

export function mongoTlsHint(err) {
  const s = `${err?.message || err} ${err?.cause?.message || ""}`;
  if (!/ssl|tls|TLS|MongoNetworkError/i.test(s)) {
    return;
  }
  console.error(`
[MongoDB connection] TLS / network error — common fixes:

  Atlas (mongodb+srv://…)
  • Network Access: add your current IP, or 0.0.0.0/0 for local dev only.
  • Password in the URI must be URL-encoded (e.g. @ → %40, # → %23).
  • Confirm the cluster is running (not paused) and the hostname matches Atlas.

  Local MongoDB (no Atlas)
  • Use: mongodb://127.0.0.1:27017/fixmycampus
  • Start the MongoDB service; this avoids Atlas TLS entirely.

  Corporate VPN / antivirus sometimes breaks TLS — try off-VPN or another network.

  Last resort (Atlas only, dev): add to .env
    MONGODB_TLS_INSECURE=true
  (weakens TLS verification — not for production.)
`);
}
