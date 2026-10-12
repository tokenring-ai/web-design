import type Agent from "@tokenring-ai/agent/Agent";
import { BrowserService } from "@tokenring-ai/browser";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import { CURRENT_DESIGN_CONTEXT } from "../contextHandlers/currentDesign.ts";
import { captureDesignScreenshot, DesignNotFoundError, type DesignScreenshot } from "../screenshot/captureDesignScreenshot.ts";
import WebDesignService from "../WebDesignService.ts";

const name = "design_screenshot";
const displayName = "Web Design/screenshot design";

async function execute({ flowName, name: designName, width, height }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const browserService = agent.requireService(BrowserService);

  if (!(await webDesignService.getDesign(flowName, designName))) {
    throw new ToolCallError(name, `Design "${flowName}/${designName}" does not exist`);
  }
  const baseUrl = await resolveBaseUrl(agent, webDesignService);
  const session = browserService.ensureSession(agent);

  let screenshot: DesignScreenshot;
  try {
    screenshot = await captureDesignScreenshot({ webDesignService, session, baseUrl, flowName, designName, width, height });
  } catch (error: unknown) {
    if (error instanceof DesignNotFoundError) throw new ToolCallError(name, error.message);
    throw new ToolCallError(name, "Failed to capture a design screenshot", { cause: error });
  } finally {
    browserService.syncState(agent, session);
  }

  const { width: viewportWidth, height: viewportHeight } = screenshot.viewport;

  return {
    message: `**Web Design** Captured a ${viewportWidth}x${viewportHeight} screenshot of "${flowName}/${designName}"`,
    result: JSON.stringify({
      design: `${flowName}/${designName}`,
      viewport: screenshot.viewport,
      console: screenshot.console,
    }),
    attachments: [
      {
        sendToLLM: true,
        name: `${screenshot.designName.replace(/\.[^.]+$/, "")}.png`,
        mimeType: "image/png",
        encoding: "base64",
        body: screenshot.base64,
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
  requiredContextHandlers: [CURRENT_DESIGN_CONTEXT],
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
