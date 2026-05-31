import { IPGeolocation } from "@/types/ip.types";
import { redis } from "..";

export async function get_IPGeolocation(
  ipaddr: string,
): Promise<IPGeolocation | false> {
  const c = await redis.redis.get("global/ip/" + ipaddr);
  if (c) {
    return JSON.parse(c) as IPGeolocation;
  }
  const r = await fetch(`https://ipapi.co/${ipaddr}/json/`);
  if (!r.ok) return false;
  const d = await r.json();
  redis.redis.setex(
    "global/ip/" + ipaddr,
    7 * 24 * 60 * 60 * 1000,
    JSON.stringify(d),
  );
  return d as IPGeolocation;
}
