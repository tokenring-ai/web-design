import type Agent from "@tokenring-ai/agent/Agent";
import { BrowserService } from "@tokenring-ai/browser";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_screenshot";
const displayName = "Web Design/screenshot design";

/** Captures what the page printed to the console since the navigation (errors first). */
function consoleReport(record: { consoleMessages: { level: string; text: string; navigationGeneration: number }[]; navigationGeneration: number }): string {
  const sinceNavigation = record.consoleMessages.filter(entry => entry.navigationGeneration >= record.navigationGeneration);
  const problems = sinceNavigation.filter(entry => entry.level === "error" || entry.level === "warning");
  const lines = (problems.length > 0 ? problems : sinceNavigation).slice(0, 20).map(entry => entry.text);
  if (lines.length === 0) return "Console: clean (no messages since navigation).";
  return `Console (${problems.length} problem${problems.length === 1 ? "" : "s"} since navigation):\n${lines.join("\n")}`;
}

async function execute({ flowName, name: designName, width, height }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const browserService = agent.requireService(BrowserService);

  const design = await webDesignService.getDesign(flowName, designName);
  if (!design) {
    throw new ToolCallError(name, `Design "${flowName}/${designName}" does not exist`);
  }

  const previewUrl = new URL(
    `/api/web-design/preview/${encodeURIComponent(flowName)}/${encodeURIComponent(design.name)}`,
    await resolveBaseUrl(agent, webDesignService),
  );
  previewUrl.searchParams.set("token", webDesignService.getPreviewToken());

  const session = browserService.ensureSession(agent);
  const record = session.ensureView();

  let base64: string;
  try {
    await session.navigate(record, previewUrl.toString());
    if (width !== undefined && height !== undefined) {
      await session.run(record, () => record.view.resize(width, height), {
        timeoutMs: session.profile.timeouts.action,
        label: "Resize viewport",
      });
      record.viewport = { width, height };
    }
    base64 = await session.run(record, () => record.view.screenshot({ encoding: "base64", format: "png" }), {
      timeoutMs: session.profile.timeouts.action,
      label: "Screenshot",
    });
  } catch (error: unknown) {
    throw new ToolCallError(name, "Failed to capture a design screenshot", { cause: error });
  } finally {
    browserService.syncState(agent, session);
  }

  const { width: viewportWidth, height: viewportHeight } = record.viewport;

  return {
    message: `**Web Design** Captured a ${viewportWidth}x${viewportHeight} screenshot of "${flowName}/${designName}"`,
    result: JSON.stringify({
      design: `${flowName}/${designName}`,
      viewport: record.viewport,
      console: consoleReport(record),
    }),
    attachments: [
      {
        sendToLLM: true,
        name: `${design.name.replace(/\.[^.]+$/, "")}.png`,
        mimeType: "image/png",
        encoding: "base64",
        body: base64,
      },
    ],
  };
}

/** Configured preview base URL, falling back to the running web host's own URL. */
async function resolveBaseUrl(agent: Agent, webDesignService: WebDesignService): Promise<string> {
  const configured = webDesignService.getPreviewBaseUrl();
  if (configured) return configured.replace(/\/+$/, "");
  try {
    return agent.requireService(WebHostService).getURL().origin;
  } catch (error: unknown) {
    throw new ToolCallError(name, "No preview base URL available: configure webDesign.previewBaseUrl or ensure the web host is running", { cause: error });
  }
}

const description =
  "Captures a screenshot of a saved design rendered in a headless browser and returns it as an image, " +
  "together with any console errors the page produced. Use it to visually review a mockup after writing it: " +
  "check layout, spacing, contrast, and hierarchy, then iterate with design_write until the design looks right. " +
  "Viewport only - capture mobile and desktop widths separately.";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow the design belongs to"),
  name: z.string().describe("Design file name to capture (for example index.html)"),
  width: z.number().int().min(1).max(16384).optional().describe("Viewport width in CSS pixels (e.g. 375 for mobile, 1280 for desktop)"),
  height: z.number().int().min(1).max(16384).optional().describe("Viewport height in CSS pixels"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
