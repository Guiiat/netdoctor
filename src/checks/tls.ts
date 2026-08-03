import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import {
  checkServerIdentity,
  connect,
  type PeerCertificate,
  type TLSSocket,
} from "node:tls";
import { errorCode, errorMessage } from "../redact.js";
import { targetIdentity } from "../targets.js";
import type { DiagnosticCheck, TargetDefinition } from "../types.js";

export function shouldCheckTls(target: TargetDefinition): boolean {
  return (
    target.protocol === "https" ||
    target.port === 443 ||
    target.port === 8443 ||
    target.port === 8883
  );
}

export async function checkTls(
  target: TargetDefinition,
  timeoutMs: number,
): Promise<DiagnosticCheck> {
  const identity = targetIdentity(target);
  const startedAt = performance.now();
  if (!shouldCheckTls(target)) {
    return {
      category: "tls",
      target: identity,
      status: "skip",
      summary: `TLS probe skipped for non-TLS port ${target.port}.`,
      durationMs: elapsed(startedAt),
      details: { port: target.port },
    };
  }

  try {
    const handshake = await probeTls(target.hostname, target.port, timeoutMs);
    const certificate = handshake.certificate;
    const validTo = Date.parse(certificate.valid_to);
    const daysRemaining = Number.isNaN(validTo)
      ? undefined
      : Math.floor((validTo - Date.now()) / 86_400_000);
    const unauthorized = !handshake.authorized;
    const hostnameMismatch = handshake.hostnameError !== undefined;
    const expired = daysRemaining !== undefined && daysRemaining < 0;
    const expiringSoon = daysRemaining !== undefined && daysRemaining <= 30;
    const status = unauthorized || hostnameMismatch || expired
      ? "fail"
      : expiringSoon
        ? "warn"
        : "pass";
    const commonName = certificate.subject?.CN;
    const certificateName = Array.isArray(commonName)
      ? commonName.join(", ")
      : commonName ?? target.hostname;
    const summary = tlsSummary(
      status,
      certificateName,
      target.hostname,
      daysRemaining,
      handshake.authorizationError,
      handshake.hostnameError,
    );

    return {
      category: "tls",
      target: identity,
      status,
      summary,
      durationMs: elapsed(startedAt),
      details: {
        authorized: handshake.authorized,
        hostnameAuthorized: !hostnameMismatch,
        ...(handshake.authorizationError === undefined
          ? {}
          : { authorizationError: handshake.authorizationError }),
        ...(handshake.hostnameError === undefined
          ? {}
          : { hostnameError: handshake.hostnameError }),
        protocol: handshake.protocol,
        cipher: handshake.cipher,
        subject: certificate.subject,
        issuer: certificate.issuer,
        validFrom: certificate.valid_from,
        validTo: certificate.valid_to,
        ...(daysRemaining === undefined ? {} : { daysRemaining }),
        subjectAltName: certificate.subjectaltname,
      },
      ...(status === "pass"
        ? {}
        : {
            recommendation: unauthorized || hostnameMismatch
              ? "Check the system clock, hostname, certificate chain, and trusted root certificates."
              : "Renew or replace the certificate before it expires.",
          }),
    };
  } catch (error) {
    const code = errorCode(error);
    return {
      category: "tls",
      target: identity,
      status: "fail",
      summary: `TLS handshake failed: ${errorMessage(error)}`,
      durationMs: elapsed(startedAt),
      details: { ...(code === undefined ? {} : { code }) },
      recommendation:
        "Confirm the service supports TLS on this port, then check SNI, protocol compatibility, firewall, and certificate configuration.",
    };
  }
}

interface TlsProbeResult {
  readonly authorized: boolean;
  readonly authorizationError?: string;
  readonly hostnameError?: string;
  readonly protocol: string | null;
  readonly cipher: ReturnType<TLSSocket["getCipher"]>;
  readonly certificate: PeerCertificate;
}

async function probeTls(
  hostname: string,
  port: number,
  timeoutMs: number,
): Promise<TlsProbeResult> {
  return await new Promise<TlsProbeResult>((resolve, reject) => {
    const socket = connect({
      host: hostname,
      port,
      ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
      rejectUnauthorized: false,
    });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error !== undefined) {
        socket.removeAllListeners();
        socket.destroy();
        reject(error);
        return;
      }
      const certificate = socket.getPeerCertificate(false);
      const hostnameError = certificateHostnameError(hostname, certificate);
      const result: TlsProbeResult = {
        authorized: socket.authorized,
        ...(socket.authorizationError === null
          ? {}
          : { authorizationError: String(socket.authorizationError) }),
        ...(hostnameError === undefined ? {} : { hostnameError }),
        protocol: socket.getProtocol(),
        cipher: socket.getCipher(),
        certificate,
      };
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate(false);
      if (Object.keys(certificate).length === 0) {
        finish(new Error("The peer did not provide a certificate."));
      } else {
        finish();
      }
    });
    socket.once("timeout", () => {
      const error = new Error(`TLS handshake timed out after ${timeoutMs} ms.`);
      Object.assign(error, { code: "ETIMEDOUT" });
      finish(error);
    });
    socket.once("error", (error) => finish(error));
  });
}

export function certificateHostnameError(
  hostname: string,
  certificate: PeerCertificate,
): string | undefined {
  return checkServerIdentity(hostname, certificate)?.message;
}

function tlsSummary(
  status: DiagnosticCheck["status"],
  certificateName: string,
  hostname: string,
  daysRemaining: number | undefined,
  authorizationError: string | undefined,
  hostnameError: string | undefined,
): string {
  if (hostnameError !== undefined) {
    return `Certificate for ${certificateName} does not match ${hostname}: ${hostnameError}.`;
  }
  if (authorizationError !== undefined) {
    return `Certificate for ${certificateName} is not trusted: ${authorizationError}.`;
  }
  if (daysRemaining === undefined) {
    return `TLS handshake succeeded for ${certificateName}; expiry could not be parsed.`;
  }
  if (daysRemaining < 0) {
    return `Certificate for ${certificateName} expired ${Math.abs(daysRemaining)} day(s) ago.`;
  }
  if (status === "warn") {
    return `Certificate for ${certificateName} expires in ${daysRemaining} day(s).`;
  }
  return `TLS is trusted; certificate for ${certificateName} is valid for ${daysRemaining} more day(s).`;
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
