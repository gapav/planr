import { createHash } from "node:crypto";
import { interestEmail, interestSchema } from "@/lib/interest";
import { createInterestRateLimit } from "@/lib/interest-rate-limit";

export const runtime = "nodejs";
const allow = createInterestRateLimit();
const MAX_BYTES = 8192;
const unavailable = "Vi fikk ikke sendt forespørselen akkurat nå. Prøv igjen om litt.";
const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

// Public by design: interested coaches do not have accounts yet. This endpoint
// can only notify the configured owner, never an address supplied as `to`.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return reply({ error: "Åpne skjemaet på Grep og prøv igjen." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply({ error: "Ugyldig format." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return reply({ error: "Meldingen er for lang." }, 413);

  // Enforce the actual streamed size too, not only a client-controlled header.
  let raw: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Fyll ut skjemaet først." }, 400);
    const decoder = new TextDecoder();
    let size = 0, text = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return reply({ error: "Meldingen er for lang." }, 413); }
        text += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    raw = JSON.parse(text + decoder.decode());
  } catch { return reply({ error: "Kunne ikke lese skjemaet. Prøv igjen." }, 400); }

  const parsed = interestSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: "Sjekk navn, e-post og klubb / lag. Meldingen kan være maks 1500 tegn." }, 400);
  if (parsed.data.website) return reply({ ok: true }); // Bot trap: no mail.

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const to = process.env.GREP_INTEREST_TO || "gardpavels@gmail.com";
  if (!key || !from) return reply({ error: unavailable }, 503);

  // Vercel supplies x-real-ip. Outside a trusted proxy, IP limits are only a
  // convenience; email/global caps also bound sends on each warm instance.
  const ip = request.headers.get("x-real-ip") || "unknown";
  if (!allow(`ip:${ip}`, 5) || !allow(`email:${parsed.data.email}`, 3) || !allow("global", 50)) {
    return reply({ error: "Det er sendt flere forespørsler på kort tid. Prøv igjen om en time." }, 429);
  }
  const mail = interestEmail(parsed.data);
  const payload = JSON.stringify({ from, to: [to], reply_to: parsed.data.email, ...mail });
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `grep-interest-${createHash("sha256").update(payload).digest("hex")}`,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!sent.ok) return reply({ error: unavailable }, 502);
    const receipt = await sent.json().catch(() => null);
    if (typeof receipt?.id !== "string" || !receipt.id) return reply({ error: unavailable }, 502);
    return reply({ ok: true });
  } catch { return reply({ error: unavailable }, 502); }
}
