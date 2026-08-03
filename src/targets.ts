import { isIP } from "node:net";
import { PRESETS, PRESET_NAMES } from "./presets.js";
import { redactUrl } from "./redact.js";
import type { PublicTarget, TargetDefinition } from "./types.js";

export interface TargetInputs {
  readonly positional?: readonly string[];
  readonly presets?: readonly string[];
  readonly urls?: readonly string[];
  readonly hosts?: readonly string[];
}

export function resolveTargets(inputs: TargetInputs): TargetDefinition[] {
  const targets: TargetDefinition[] = [];
  const positional = inputs.positional ?? [];
  const presets = inputs.presets ?? [];
  const urls = inputs.urls ?? [];
  const hosts = inputs.hosts ?? [];

  for (const name of presets.flatMap(splitCommaSeparated)) {
    targets.push(...expandPreset(name));
  }
  for (const input of urls) {
    targets.push(parseUrlTarget(input));
  }
  for (const input of hosts) {
    targets.push(parseHostTarget(input));
  }
  for (const input of positional.flatMap(splitPositional)) {
    const normalized = input.toLowerCase();
    if (normalized === "all" || normalized in PRESETS) {
      targets.push(...expandPreset(normalized));
    } else if (/^https?:\/\//i.test(input)) {
      targets.push(parseUrlTarget(input));
    } else {
      targets.push(parseHostTarget(input));
    }
  }

  if (targets.length === 0) {
    for (const preset of PRESET_NAMES) {
      targets.push(...expandPreset(preset));
    }
  }

  const unique = new Map<string, TargetDefinition>();
  for (const target of targets) {
    const key = target.url ?? `${target.hostname.toLowerCase()}:${target.port}`;
    if (!unique.has(key)) {
      unique.set(key, target);
    }
  }
  return [...unique.values()];
}

export function expandPreset(input: string): TargetDefinition[] {
  const name = input.trim().toLowerCase();
  if (name === "all") {
    return PRESET_NAMES.flatMap((presetName) => expandPreset(presetName));
  }
  const preset = PRESETS[name];
  if (preset === undefined) {
    throw new Error(
      `Unknown preset "${input}". Available presets: ${PRESET_NAMES.join(", ")}`,
    );
  }
  return preset.targets.map((target) => {
    const parsed = parseUrlTarget(target.url, target.label);
    return {
      ...parsed,
      source: "preset" as const,
      preset: preset.name,
      ...(target.expectedStatuses === undefined
        ? {}
        : { expectedStatuses: target.expectedStatuses }),
    };
  });
}

export function parseUrlTarget(input: string, label?: string): TargetDefinition {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${redactUrl(input)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}"; use http or https.`);
  }
  if (parsed.hostname === "") {
    throw new Error(`URL has no hostname: ${redactUrl(input)}`);
  }
  const protocol = parsed.protocol.slice(0, -1) as "http" | "https";
  const port = parsePort(parsed.port, protocol === "https" ? 443 : 80);
  return {
    input: redactUrl(input),
    label: label ?? redactUrl(parsed.toString()),
    hostname: parsed.hostname,
    port,
    protocol,
    url: parsed.toString(),
    source: "url",
  };
}

export function parseHostTarget(input: string): TargetDefinition {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Host cannot be empty.");
  }
  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error(`Invalid host "${trimmed}"; use --url for paths and query strings.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(`tcp://${trimmed}`);
  } catch {
    throw new Error(`Invalid host: ${trimmed}`);
  }
  if (parsed.hostname === "") {
    throw new Error(`Invalid host: ${trimmed}`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("A host target cannot contain a username or password; use --url instead.");
  }
  const port = parsePort(parsed.port, 443);
  const hostname = stripIpv6Brackets(parsed.hostname);
  const displayHost = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  return {
    input: trimmed,
    label: `${displayHost}:${port}`,
    hostname,
    port,
    source: "host",
  };
}

export function publicTarget(target: TargetDefinition): PublicTarget {
  return {
    input: target.input,
    label: target.label,
    hostname: target.hostname,
    port: target.port,
    ...(target.protocol === undefined ? {} : { protocol: target.protocol }),
    ...(target.url === undefined ? {} : { url: redactUrl(target.url) }),
    source: target.source,
    ...(target.preset === undefined ? {} : { preset: target.preset }),
  };
}

export function targetIdentity(target: TargetDefinition): string {
  if (target.url !== undefined) {
    return redactUrl(target.url);
  }
  const displayHost = isIP(target.hostname) === 6 ? `[${target.hostname}]` : target.hostname;
  return `${displayHost}:${target.port}`;
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function splitPositional(value: string): string[] {
  const entries = splitCommaSeparated(value);
  return entries.length > 1 && entries.every((entry) => entry === "all" || entry.toLowerCase() in PRESETS)
    ? entries
    : [value];
}

function parsePort(value: string, fallback: number): number {
  if (value === "") {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}
