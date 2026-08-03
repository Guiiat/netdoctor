import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { errorCode, errorMessage } from "../redact.js";
import { targetIdentity } from "../targets.js";
import type { DiagnosticCheck, TargetDefinition } from "../types.js";

export async function checkDns(
  target: TargetDefinition,
  timeoutMs: number,
): Promise<DiagnosticCheck> {
  const identity = targetIdentity(target);
  const startedAt = performance.now();

  if (isIP(target.hostname) !== 0) {
    return {
      category: "dns",
      target: identity,
      status: "pass",
      summary: `${target.hostname} is already an IP address; DNS was not required.`,
      durationMs: elapsed(startedAt),
      details: { addresses: [{ address: target.hostname, family: isIP(target.hostname) }] },
    };
  }

  const [lookupResult, ipv4Result, ipv6Result] = await Promise.allSettled([
    withTimeout(
      dns.lookup(target.hostname, { all: true, verbatim: true }),
      timeoutMs,
      `OS DNS lookup timed out after ${timeoutMs} ms.`,
    ),
    withTimeout(
      dns.resolve4(target.hostname, { ttl: true }),
      timeoutMs,
      `IPv4 DNS query timed out after ${timeoutMs} ms.`,
    ),
    withTimeout(
      dns.resolve6(target.hostname, { ttl: true }),
      timeoutMs,
      `IPv6 DNS query timed out after ${timeoutMs} ms.`,
    ),
  ]);

  try {
    if (lookupResult.status === "rejected") throw lookupResult.reason;
    const addresses = lookupResult.value;
    const unique = addresses.filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.address === entry.address && candidate.family === entry.family,
        ) === index,
    );
    const directDnsFailed = ipv4Result.status === "rejected" && ipv6Result.status === "rejected";
    const localName = target.hostname === "localhost" || target.hostname.endsWith(".localhost");
    return {
      category: "dns",
      target: identity,
      status: directDnsFailed && !localName ? "warn" : "pass",
      summary: directDnsFailed && !localName
        ? `The OS resolved ${target.hostname}, but direct A/AAAA queries returned no records.`
        : `Resolved ${target.hostname} to ${unique.length} address${unique.length === 1 ? "" : "es"}.`,
      durationMs: elapsed(startedAt),
      details: {
        osAddresses: unique,
        dnsA: ipv4Result.status === "fulfilled" ? ipv4Result.value : [],
        dnsAAAA: ipv6Result.status === "fulfilled" ? ipv6Result.value : [],
        resolverErrors: [
          ...(ipv4Result.status === "rejected"
            ? [{ family: 4, message: errorMessage(ipv4Result.reason), code: errorCode(ipv4Result.reason) }]
            : []),
          ...(ipv6Result.status === "rejected"
            ? [{ family: 6, message: errorMessage(ipv6Result.reason), code: errorCode(ipv6Result.reason) }]
            : []),
        ],
      },
      ...(directDnsFailed && !localName
        ? {
            recommendation:
              "The name may come from a hosts file, VPN, or split DNS; verify that this is expected.",
          }
        : {}),
    };
  } catch (error) {
    const code = errorCode(error);
    return {
      category: "dns",
      target: identity,
      status: "fail",
      summary: `Could not resolve ${target.hostname}: ${errorMessage(error)}`,
      durationMs: elapsed(startedAt),
      details: { ...(code === undefined ? {} : { code }), hostname: target.hostname },
      recommendation:
        code === "ENOTFOUND" || code === "EAI_AGAIN"
          ? "Verify the hostname and DNS server; flush the DNS cache or try another resolver."
          : "Check the configured DNS server, VPN, and network connectivity.",
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          Object.assign(error, { code: "ETIMEDOUT" });
          reject(error);
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
