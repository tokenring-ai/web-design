import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_list";
const displayName = "Web Design/list designs";

async function execute({ flowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const designs = await webDesignService.listDesigns(directory, flowName);

  return {
    message: `**Web Design** Listed ${designs.length} design${designs.length === 1 ? "" : "s"} in flow "${flowName}"`,
    result: JSON.stringify({ designs }),
  };
}

const description = "List the named HTML designs within a design flow";

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
