import { AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { WebDesignState } from "../state/WebDesignState.ts";
import WebDesignService from "../WebDesignService.ts";
import WebDesignRpcSchema from "./schema.ts";

async function projectFlows(_args: Record<string, never>, app: TokenRingApp) {
  const webDesignService = app.requireService(WebDesignService);
  const flows = await webDesignService.listFlows();
  return { flows };
}

async function projectDesigns(args: { flowName: string }, app: TokenRingApp) {
  const webDesignService = app.requireService(WebDesignService);
  const designs = await webDesignService.listDesigns(args.flowName);
  return { designs };
}

const streamFlows = createPollingQueryStream({
  intervalMs: 3000,
  poll: projectFlows,
});

const streamDesigns = createPollingQueryStream({
  intervalMs: 3000,
  poll: projectDesigns,
});

export default createRPCEndpoint(WebDesignRpcSchema, {
  async listFlows(args, app: TokenRingApp) {
    return projectFlows(args, app);
  },

  streamFlows,

  async createFlow(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const flow = await webDesignService.createFlow(args.name);
    return { flow };
  },

  async deleteFlow(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const success = await webDesignService.deleteFlow(args.name);
    return { success };
  },

  async listDesigns(args, app: TokenRingApp) {
    return projectDesigns(args, app);
  },

  streamDesigns,

  async getDesign(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const design = await webDesignService.getDesign(args.flowName, args.name);
    return { design };
  },

  async createDesign(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const design = await webDesignService.createDesign(args.flowName, args.name, args.content, args.encoding);
    return { design };
  },

  async updateDesign(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const design = await webDesignService.updateDesign(args.flowName, args.name, args.content, args.encoding);
    return { design };
  },

  async deleteDesign(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const success = await webDesignService.deleteDesign(args.flowName, args.name);
    return { success };
  },

  getWebDesignState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const state = agent.getState(WebDesignState);
    return {
      status: "success",
      selectedFlowName: state.currentDesign?.flowName ?? null,
      selectedDesignName: state.currentDesign?.name ?? null,
    };
  },

  async updateWebDesignState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const webDesignService = app.requireService(WebDesignService);

    if (args.selectedFlowName && args.selectedDesignName) {
      await webDesignService.selectDesign(args.selectedFlowName, args.selectedDesignName, agent);
    }

    const state = agent.getState(WebDesignState);
    return {
      status: "success",
      selectedFlowName: state.currentDesign?.flowName ?? null,
      selectedDesignName: state.currentDesign?.name ?? null,
    };
  },
});
