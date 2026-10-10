import { registerPresence } from "./_store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limit: basic check via headers
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { id, lat, lng, signal, tone, nickname } = body;

    if (!id || typeof id !== "string" || id.length < 8 || id.length > 64) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "Invalid coordinates" });
    }
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Coordinates out of range" });
    }

    const record = await registerPresence(id, lat, lng, { signal, tone, nickname });
    return res.status(200).json({ ok: true, me: record });
  } catch (err: any) {
    console.error("[join]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
