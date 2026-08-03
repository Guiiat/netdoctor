import { createConnection } from "node:net";
import { performance } from "node:perf_hooks";
import { errorCode, errorMessage } from "../redact.js";
import { targetIdentity } from "../targets.js";
import type { DiagnosticCheck, TargetDefinition } from "../types.js";

export interface TcpProbeResult {
  readonly latencyMs: number;
  readonly remoteAddress?: string;
  readonly remotePort?: number;
}

export async function probeTcp(
  hostname: string,
  port: number,
  timeoutMs: number,
): Promise<TcpProbeResult> {
  const startedAt = performance.now();
  return await new Promise<TcpProbeResult>((resolve, reject) => {
    const socket = createConnection({ host: hostname, port });
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      const result: TcpProbeResult = {
        latencyMs: elapsed(startedAt),
        ...(socket.remoteAddress === undefined ? {} : { remoteAddress: socket.remoteAddress }),
        ...(socket.remotePort === undefined ? {} : { remotePort: socket.remotePort }),
      };
      socket.removeAllListeners();
      socket.destroy();
      if (error === undefined) resolve(result);
      else reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish());
    socket.once("timeout", () => {
      const error = new Error(`TCP connection timed out after ${timeoutMs} ms.`);
      Object.assign(error, { code: "ETIMEDOUT" });
      finish(error);
    });
    socket.once("error", (error) => finish(error));
  });
}

export async function checkTcp(
  target: TargetDefinition,
  timeoutMs: number,
): Promise<DiagnosticCheck> {
  const identity = targetIdentity(target);
  const startedAt = performance.now();
  try {
    const result = await probeTcp(target.hostname, target.port, timeoutMs);
    return {
      category: "tcp",
      target: identity,
      status: "pass",
      summary: `Connected to ${target.hostname}:${target.port} in ${result.latencyMs} ms.`,
      durationMs: elapsed(startedAt),
      details: { ...result },
    };
  } catch (error) {
    const code = errorCode(error);
    return {
      category: "tcp",
      target: identity,
      status: "fail",
      summary: `Could not connect to ${target.hostname}:${target.port}: ${errorMessage(error)}`,
      durationMs: elapsed(startedAt),
      details: {
        ...(code === undefined ? {} : { code }),
        hostname: target.hostname,
        port: target.port,
      },
      recommendation: tcpRecommendation(code),
    };
  }
}

function tcpRecommendation(code: string | undefined): string {
  switch (code) {
    case "ECONNREFUSED":
      return "The host is reachable but nothing accepts connections on this port; check the service and port.";
    case "ETIMEDOUT":
      return "Check firewall, VPN, proxy, routing, and whether the destination allows this network.";
    case "ENETUNREACH":
    case "EHOSTUNREACH":
      return "Check the active network interface, default route, VPN, and IPv4/IPv6 connectivity.";
    default:
      return "Check the destination port, local firewall, VPN, and proxy configuration.";
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
