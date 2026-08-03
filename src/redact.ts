import { homedir } from "node:os";

const SENSITIVE_OBJECT_KEYS = new Set([
  "accesstoken",
  "apikey",
  "auth",
  "authorization",
  "authorizationcode",
  "clientcredential",
  "clientsecret",
  "cookie",
  "credential",
  "credentials",
  "key",
  "oauthcode",
  "password",
  "passwd",
  "privatekey",
  "proxyauthorization",
  "refreshtoken",
  "secret",
  "sessiontoken",
  "setcookie",
  "signature",
  "sig",
  "token",
]);
const SENSITIVE_QUERY_KEYS = new Set([...SENSITIVE_OBJECT_KEYS, "code"]);

const URL_WITH_USERINFO = /([a-z][a-z\d+.-]*:\/\/)([^\s/@]+)@/gi;
const EMBEDDED_HTTP_URL = /https?:\/\/[^\s<>"']+/gi;
const AUTHORIZATION_HEADER =
  /((?:proxy-)?authorization[ \t]*:[ \t]*)[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gi;
const COOKIE_HEADER = /((?:set-)?cookie\s*:\s*)[^\r\n]+/gi;
const ASSIGNMENT_CANDIDATE =
  /(^|[^A-Za-z0-9_])(?:(['"])([A-Za-z][A-Za-z0-9_.-]*)\2|([A-Za-z][A-Za-z0-9_.-]*))(\s*[=:]\s*)("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;&]+)/gim;
const OSC_SEQUENCE = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g;
const C0_AND_C1_CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const CONTROL_EXCEPT_LINE_BREAKS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function redactUrl(value: string): string {
  const cleanValue = removeTerminalControls(value).replace(/[\r\n]/g, "");
  try {
    const url = new URL(cleanValue);
    if (url.username !== "") {
      url.username = "***";
    }
    if (url.password !== "") {
      url.password = "***";
    }
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key)) || isSensitiveKey(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString().replaceAll("%2A%2A%2A", "***");
  } catch {
    return cleanValue.replace(URL_WITH_USERINFO, "$1***:***@");
  }
}

export function redactText(value: string, secrets: readonly string[] = []): string {
  let safe = removeTerminalControls(value)
    .replace(AUTHORIZATION_HEADER, "$1[REDACTED]")
    .replace(COOKIE_HEADER, "$1[REDACTED]")
    .replace(EMBEDDED_HTTP_URL, (match) => redactUrl(match))
    .replace(URL_WITH_USERINFO, "$1***:***@")
    .replace(
      ASSIGNMENT_CANDIDATE,
      (match, prefix: string, quote: string | undefined, quotedKey: string | undefined,
        plainKey: string | undefined, separator: string) => {
        const key = quotedKey ?? plainKey;
        if (key === undefined || !isSensitiveKey(key)) return match;
        const keyQuote = quote ?? "";
        return `${prefix}${keyQuote}${key}${keyQuote}${separator}[REDACTED]`;
      },
    );
  for (const secret of secrets) {
    if (secret !== "") {
      safe = safe.split(secret).join(redactUrl(secret));
    }
  }
  const home = homedir();
  if (home !== "") {
    safe = replaceInsensitive(safe, home, "~");
  }
  return stripControlCharacters(safe);
}

export function errorMessage(error: unknown, secrets: readonly string[] = []): string {
  if (error instanceof Error) {
    return redactText(error.message, secrets);
  }
  return redactText(String(error), secrets);
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function redactValue(value: unknown): unknown {
  return redactNestedValue(value);
}

export function stripControlCharacters(value: string): string {
  return value
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(C0_AND_C1_CONTROL, " ");
}

function redactNestedValue(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") {
    return redactText(redactUrlIfApplicable(value));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactNestedValue(entry, parentKey));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[stripControlCharacters(key)] = isSensitiveObjectKey(key, parentKey)
        ? "[REDACTED]"
        : redactNestedValue(entry, key);
    }
    return output;
  }
  return value;
}

function isSensitiveObjectKey(key: string, parentKey?: string): boolean {
  const normalized = normalizeKey(key);
  if (isSensitiveKey(key)) return true;
  return normalized === "code" &&
    (normalizeKey(parentKey ?? "") === "oauth" || normalizeKey(parentKey ?? "") === "authorization");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_OBJECT_KEYS.has(normalized)) return true;

  const words = stripControlCharacters(key)
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter((word) => word !== "");
  return words.some((word) =>
    word === "secret" ||
    word === "secrets" ||
    word === "token" ||
    word === "tokens" ||
    word === "key" ||
    word === "keys" ||
    word === "password" ||
    word === "passwd" ||
    word === "credential" ||
    word === "credentials"
  );
}

function normalizeKey(key: string): string {
  return stripControlCharacters(key).replace(/[-_\s]/g, "").toLowerCase();
}

function removeTerminalControls(value: string): string {
  return value
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(CONTROL_EXCEPT_LINE_BREAKS, "");
}

function redactUrlIfApplicable(value: string): string {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? redactUrl(value) : value;
}

function replaceInsensitive(value: string, search: string, replacement: string): string {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escaped, "gi"), replacement);
}
