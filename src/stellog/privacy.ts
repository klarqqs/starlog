import ipaddr from 'ipaddr.js';

/** IPv4 keeps a /24. IPv6 keeps a /48. Both are choices for the Stellog collect path. */
export function truncateIp(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (!ipaddr.isValid(trimmed)) return undefined;
  const parsed = ipaddr.parse(trimmed);
  if (parsed.kind() === 'ipv4') {
    const bytes = parsed.toByteArray();
    bytes[3] = 0;
    return ipaddr.fromByteArray(bytes).toString();
  }
  const bytes = parsed.toByteArray();
  for (let index = 6; index < bytes.length; index += 1) bytes[index] = 0;
  return ipaddr.fromByteArray(bytes).toString();
}
