import { redactValue } from "../redact.js";
import type { DiagnosticReport } from "../types.js";

export function renderJson(report: DiagnosticReport): string {
  return `${JSON.stringify(redactValue(report), null, 2)}\n`;
}
