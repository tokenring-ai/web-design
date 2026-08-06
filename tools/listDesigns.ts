import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_list";
const displayName = "Web Design/list designs";

async function execute({ flowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const designs = await webDesignService.listDesigns(flowName);

  return {
    message: `**Web Design** Listed ${designs.length} file${designs.length === 1 ? "" : "s"} in flow "${flowName}"`,
    result: JSON.stringify({ designs }),
  };
}

const description = "List the HTML, CSS, JavaScript, and asset files within a design flow";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow to list designs from"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
