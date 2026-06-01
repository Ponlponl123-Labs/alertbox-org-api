import { IPGeolocation } from "@/types/ip.types";
import { redis } from "..";

export const reserved_IPs = ["::1", "127.0.0.1", "0.0.0.0"];

export const private_IPs = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

export function isReservedIP(ip: string): boolean {
  return reserved_IPs.includes(ip);
}

export function isPrivateIP(ip: string): boolean {
  return private_IPs.some((cidr) => {
    const [subnet, prefix] = cidr.split("/");
    const subnetParts = subnet.split(".").map(Number);
    const ipParts = ip.split(".").map(Number);

    for (let i = 0; i < parseInt(prefix); i++) {
      if ((subnetParts[i] & 0xff) !== (ipParts[i] & 0xff)) {
        return false;
      }
    }
    return true;
  });
}

export async function get_IPGeolocation(
  ipaddr: string,
): Promise<IPGeolocation | false> {
  if (isReservedIP(ipaddr) || isPrivateIP(ipaddr)) {
    return false;
  }
  const c = await redis.redis.get("global:ip:" + ipaddr);
  if (c) {
    return JSON.parse(c) as IPGeolocation;
  }
  const r = await fetch(`https://ipapi.co/${ipaddr}/json/`);
  if (!r.ok) return false;
  const d = await r.json();
  redis.redis.setex(
    "global:ip:" + ipaddr,
    7 * 24 * 60 * 60 * 1000,
    JSON.stringify(d),
  );
  return d as IPGeolocation;
}
