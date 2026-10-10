import { touchPresence, listPeers, drainSignals } from "./_store.js";

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");

    if (!id || typeof id !== "string" || id.length < 8 || id.length > 64) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }

    const signal = url.searchParams.get("signal") as any;
    const tone = url.searchParams.get("tone") as any;
    const nickname = url.searchParams.get("nickname") || undefined;
    const invisible = url.searchParams.get("invisible") === "true";
    const latStr = url.searchParams.get("lat");
    const lngStr = url.searchParams.get("lng");
    const lat = latStr ? parseFloat(latStr) : undefined;
    const lng = lngStr ? parseFloat(lngStr) : undefined;

    // Validate coordinates if provided
    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      return res.status(400).json({ error: "Invalid lat" });
    }
    if (lng !== undefined && (isNaN(lng) || lng < -180 || lng > 180)) {
      return res.status(400).json({ error: "Invalid lng" });
    }

    await touchPresence(id, { signal, tone, nickname, lat, lng, invisible });
    const peers = await listPeers(id, lat, lng, signal);
    const signals = await drainSignals(id);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ peers, signals });
  } catch (err: any) {
    console.error("[poll]", err.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
