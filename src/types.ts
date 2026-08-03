export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export type CheckCategory = "proxy" | "dns" | "tcp" | "tls" | "http";

export interface TargetDefinition {
  readonly input: string;
  readonly label: string;
  readonly hostname: string;
  readonly port: number;
  readonly protocol?: "http" | "https";
  readonly url?: string;
  readonly source: "preset" | "url" | "host";
  readonly preset?: string;
  readonly expectedStatuses?: readonly number[];
}

export interface PublicTarget {
  readonly input: string;
  readonly label: string;
  readonly hostname: string;
  readonly port: number;
  readonly protocol?: "http" | "https";
  readonly url?: string;
  readonly source: TargetDefinition["source"];
  readonly preset?: string;
}

export interface DiagnosticCheck {
  readonly category: CheckCategory;
  readonly target: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly durationMs: number;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly recommendation?: string;
}

export interface DiagnosticSummary {
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
  readonly skip: number;
  readonly total: number;
}

export interface DiagnosticReport {
  readonly schemaVersion: 1;
  readonly tool: "netdoctor";
  readonly toolVersion: string;
  readonly generatedAt: string;
  readonly durationMs: number;
  readonly options: {
    readonly timeoutMs: number;
    readonly maxRedirects: number;
    readonly strict: boolean;
  };
  readonly targets: readonly PublicTarget[];
  readonly checks: readonly DiagnosticCheck[];
  readonly summary: DiagnosticSummary;
  readonly exitCode: 0 | 1;
}

export interface DiagnosticOptions {
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly strict?: boolean;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface CliOptions {
  readonly inputs: readonly string[];
  readonly presetInputs: readonly string[];
  readonly urlInputs: readonly string[];
  readonly hostInputs: readonly string[];
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly format: "human" | "json" | "markdown";
  readonly color: boolean;
  readonly strict: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly listPresets: boolean;
}
