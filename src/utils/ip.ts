import { redis } from "@/core/redis";
import { week } from "@/consts/time";
import type { GeoIPResponse } from "@/types/geo-ip";

export const reserved_IPs = ["::1", "127.0.0.1", "0.0.0.0"];

export const private_IPs = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

export function isReservedIP(ip: string): boolean {
  return reserved_IPs.includes(ip);
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function isPrivateIP(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const ipNum = ipToInt(ip);
  return private_IPs.some((cidr) => {
    const [subnet, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const subnetNum = ipToInt(subnet);
    return (ipNum & mask) === (subnetNum & mask);
  });
}

export async function get_IPGeolocation(
  ipaddr: string,
): Promise<GeoIPResponse | false> {
  if (isReservedIP(ipaddr) || isPrivateIP(ipaddr) || !process.env.EXTERNAL_GEOIP_API) {
    return false;
  }
  const c = await redis.redis.get("global:ip:" + ipaddr);
  if (c) {
    try {
      return JSON.parse(c) as GeoIPResponse;
    } catch {
      // fallback to fetch
    }
  }
  try {
    const r = await fetch(`${process.env.EXTERNAL_GEOIP_API}/geo/${ipaddr}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return false;
    const d = await r.json();
    redis.redis.setex(
      "global:ip:" + ipaddr,
      week,
      JSON.stringify(d),
    );
    return d as GeoIPResponse;
  } catch {
    return false;
  }
}
