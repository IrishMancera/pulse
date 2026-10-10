import { queueSignal } from "./_store.js";

const VALID_TYPES = new Set(["request", "accept", "decline", "offer", "answer", "ice", "end"]);
const MAX_PAYLOAD = 16_000; // 16 KB for SDP/ICE

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { fromId, toId, type, payload } = body;

    if (!fromId || !toId || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (fromId === toId) {
      return res.status(400).json({ error: "Cannot signal yourself" });
    }
    if (typeof fromId !== "string" || fromId.length < 8 || fromId.length > 64) {
      return res.status(400).json({ error: "Invalid fromId" });
    }
    if (typeof toId !== "string" || toId.length < 8 || toId.length > 64) {
      return res.status(400).json({ error: "Invalid toId" });
    }
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid signal type" });
    }
    if (payload !== null && payload !== undefined) {
      if (typeof payload !== "string") {
        return res.status(400).json({ error: "Payload must be string or null" });
      }
      if (payload.length > MAX_PAYLOAD) {
        return res.status(413).json({ error: "Payload too large" });
      }
    }

    const result = await queueSignal(fromId, toId, type, payload);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[signal]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
