import { createHmac, randomBytes } from "node:crypto";

// Best-effort, process-local guard. Add a hosting/WAF rule before promoting
// publicly at scale: separate serverless instances do not share this memory.
// Never retain raw addresses or contact details in these short-lived buckets.
export function createInterestRateLimit() {
  const salt = randomBytes(32);
  const buckets = new Map<string, { count: number; expires: number }>();
  return (identity: string, limit: number, now = Date.now()) => {
    for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
    const key = createHmac("sha256", salt).update(identity).digest("hex");
    const bucket = buckets.get(key);
    if (bucket && bucket.count >= limit) return false;
    if (bucket) bucket.count++;
    else {
      if (buckets.size >= 2000) return false;
      buckets.set(key, { count: 1, expires: now + 3_600_000 });
    }
    return true;
  };
}
