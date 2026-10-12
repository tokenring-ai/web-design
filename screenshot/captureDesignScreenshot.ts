import type { BrowserSession } from "@tokenring-ai/browser";
import type WebDesignService from "../WebDesignService.ts";

/** Viewport, image and console report of one captured design. */
export interface DesignScreenshot {
  /** Flow-relative design name as stored (e.g. `index.html`). */
  designName: string;
  /** PNG bytes, base64-encoded. */
  base64: string;
  viewport: { width: number; height: number };
  /** Human-readable summary of what the page logged since the navigation. */
  console: string;
}

interface ConsoleRecord {
  consoleMessages: { level: string; text: string; navigationGeneration: number }[];
  navigationGeneration: number;
}

/** Captures what the page printed to the console since the navigation (errors first). */
export function consoleReport(record: ConsoleRecord): string {
  const sinceNavigation = record.consoleMessages.filter(entry => entry.navigationGeneration >= record.navigationGeneration);
  const problems = sinceNavigation.filter(entry => entry.level === "error" || entry.level === "warning");
  const lines = (problems.length > 0 ? problems : sinceNavigation).slice(0, 20).map(entry => entry.text);
  if (lines.length === 0) return "Console: clean (no messages since navigation).";
  return `Console (${problems.length} problem${problems.length === 1 ? "" : "s"} since navigation):\n${lines.join("\n")}`;
}

export class DesignNotFoundError extends Error {
  constructor(flowName: string, designName: string) {
    super(`Design "${flowName}/${designName}" does not exist`);
    this.name = "DesignNotFoundError";
  }
}

/**
 * Renders a saved design through the token-gated preview route in a browser
 * session and screenshots the viewport. Shared by the `design_screenshot`
 * agent tool (the agent's own session) and the `captureDesignScreenshot` RPC
 * (a throwaway session), so both capture exactly the same thing.
 */
export async function captureDesignScreenshot({
  webDesignService,
  session,
  baseUrl,
  flowName,
  designName,
  width,
  height,
}: {
  webDesignService: WebDesignService;
  session: Pick<BrowserSession, "ensureView" | "navigate" | "run" | "profile">;
  baseUrl: string;
  flowName: string;
  designName: string;
  width?: number | undefined;
  height?: number | undefined;
}): Promise<DesignScreenshot> {
  const design = await webDesignService.getDesign(flowName, designName);
  if (!design) throw new DesignNotFoundError(flowName, designName);

  const previewUrl = new URL(`/api/web-design/preview/${encodeURIComponent(flowName)}/${encodeURIComponent(design.name)}`, baseUrl);
  previewUrl.searchParams.set("token", webDesignService.getPreviewToken());

  const record = session.ensureView();
  await session.navigate(record, previewUrl.toString());
  if (width !== undefined && height !== undefined) {
    await session.run(record, () => record.view.resize(width, height), {
      timeoutMs: session.profile.timeouts.action,
      label: "Resize viewport",
    });
    record.viewport = { width, height };
  }
  const base64 = await session.run(record, () => record.view.screenshot({ encoding: "base64", format: "png" }), {
    timeoutMs: session.profile.timeouts.action,
    label: "Screenshot",
  });

  return { designName: design.name, base64, viewport: { ...record.viewport }, console: consoleReport(record) };
}

/** `index.html` → `screenshots/index-1280x720-20260712T101500Z.png` (flow-relative, collision-resistant). */
export function screenshotFileName(designName: string, viewport: { width: number; height: number }, now: Date = new Date()): string {
  const base = (designName.split("/").pop() ?? designName).replace(/\.[^.]+$/, "") || "design";
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `screenshots/${base}-${viewport.width}x${viewport.height}-${stamp}.png`;
}
