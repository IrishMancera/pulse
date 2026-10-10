import { removePresence, queueSignal } from "./_store.js";

export default async function handler(req: any, res: any) {
  try {
    let id: string | undefined;
    let peerId: string | undefined;

    if (req.method === "POST") {
      const body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body && typeof req.body === "object"
        ? req.body
        : {};
      id = body.id;
      peerId = body.peerId;
    } else if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      id = url.searchParams.get("id") || undefined;
    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (id && typeof id === "string" && id.length >= 8) {
      // Notify peer that we left (clean disconnect signal)
      if (peerId && typeof peerId === "string" && peerId.length >= 8 && peerId !== id) {
        await queueSignal(id, peerId, "end", null);
      }
      await removePresence(id);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[leave]", err.message);
    // Always return 200 for leave — client may not retry
    return res.status(200).json({ ok: true });
  }
}
