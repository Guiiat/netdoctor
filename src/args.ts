import type { CliOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REDIRECTS = 5;

export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const inputs: string[] = [];
  const presetInputs: string[] = [];
  const urlInputs: string[] = [];
  const hostInputs: string[] = [];
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let maxRedirects = DEFAULT_MAX_REDIRECTS;
  let format: CliOptions["format"] = "human";
  let color = process.env.NO_COLOR === undefined;
  let strict = false;
  let help = false;
  let version = false;
  let listPresets = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--") {
      inputs.push(...argv.slice(index + 1));
      break;
    }
    if (!argument.startsWith("-") || argument === "-") {
      inputs.push(argument);
      continue;
    }
    const [flag, inlineValue] = splitFlag(argument);
    switch (flag) {
      case "--preset":
      case "-p":
        presetInputs.push(readValue(flag, inlineValue, argv, () => ++index));
        break;
      case "--url":
      case "-u":
        urlInputs.push(readValue(flag, inlineValue, argv, () => ++index));
        break;
      case "--host":
      case "-H":
        hostInputs.push(readValue(flag, inlineValue, argv, () => ++index));
        break;
      case "--timeout":
      case "-t":
        timeoutMs = parseInteger(
          readValue(flag, inlineValue, argv, () => ++index),
          flag,
          250,
          60_000,
        );
        break;
      case "--max-redirects":
        maxRedirects = parseInteger(
          readValue(flag, inlineValue, argv, () => ++index),
          flag,
          0,
          20,
        );
        break;
      case "--json":
        format = selectFormat(format, "json");
        break;
      case "--markdown":
      case "--md":
        format = selectFormat(format, "markdown");
        break;
      case "--no-color":
        color = false;
        break;
      case "--color":
        color = true;
        break;
      case "--strict":
        strict = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-v":
        version = true;
        break;
      case "--list-presets":
        listPresets = true;
        break;
      default:
        throw new CliUsageError(`Unknown option: ${flag}`);
    }
  }

  return {
    inputs,
    presetInputs,
    urlInputs,
    hostInputs,
    timeoutMs,
    maxRedirects,
    format,
    color,
    strict,
    help,
    version,
    listPresets,
  };
}

function splitFlag(argument: string): readonly [string, string | undefined] {
  const equals = argument.indexOf("=");
  return equals < 0
    ? [argument, undefined]
    : [argument.slice(0, equals), argument.slice(equals + 1)];
}

function readValue(
  flag: string,
  inlineValue: string | undefined,
  argv: readonly string[],
  advance: () => number,
): string {
  const value = inlineValue ?? argv[advance()];
  if (value === undefined || value === "" || (inlineValue === undefined && value.startsWith("-"))) {
    throw new CliUsageError(`${flag} requires a value.`);
  }
  return value;
}

function parseInteger(value: string, flag: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CliUsageError(`${flag} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function selectFormat(
  current: CliOptions["format"],
  requested: CliOptions["format"],
): CliOptions["format"] {
  if (current !== "human" && current !== requested) {
    throw new CliUsageError("--json and --markdown cannot be used together.");
  }
  return requested;
}
