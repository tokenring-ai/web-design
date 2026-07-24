import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "flow_list";
const displayName = "Web Design/list flows";

async function execute(_input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const flows = await webDesignService.listFlows(directory);

  return {
    message: `**Web Design** Listed ${flows.length} flow${flows.length === 1 ? "" : "s"}`,
    result: JSON.stringify({ flows }),
  };
}

const description = "List the design flows (collections of related designs) in the web design directory";

const inputSchema = z.object({});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
