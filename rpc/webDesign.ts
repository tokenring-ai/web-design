import { AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import type { DesignSummary, FlowSummary } from "../schema.ts";
import { WebDesignState } from "../state/WebDesignState.ts";
import WebDesignService from "../WebDesignService.ts";
import { bumpDesignRevision, getDesignRevision } from "./revision.ts";
import WebDesignRpcSchema from "./schema.ts";

/**
 * Stream pollers tick frequently but rescan the directory only when the design
 * revision changed (a write landed under the design directory), so updates
 * arrive promptly without periodic filesystem scans.
 */
const STREAM_INTERVAL_MS = 500;

async function projectFlows(_args: Record<string, never>, app: TokenRingApp) {
  const revision = getDesignRevision();
  const cache = flowListCache;
  if (cache && cache.revision === revision) return cache.payload;

  const webDesignService = app.requireService(WebDesignService);
  const payload = { flows: await webDesignService.listFlows() };
  flowListCache = { revision, payload };
  return payload;
}

let flowListCache: { revision: number; payload: { flows: FlowSummary[] } } | null = null;
const designListCaches = new Map<string, { revision: number; payload: { designs: DesignSummary[] } }>();

async function projectDesigns(args: { flowName: string }, app: TokenRingApp) {
  const revision = getDesignRevision();
  const cache = designListCaches.get(args.flowName);
  if (cache && cache.revision === revision) return cache.payload;

  const webDesignService = app.requireService(WebDesignService);
  const payload = { designs: await webDesignService.listDesigns(args.flowName) };
  designListCaches.set(args.flowName, { revision, payload });
  return payload;
}

const streamFlows = createPollingQueryStream({
  intervalMs: STREAM_INTERVAL_MS,
  poll: projectFlows,
});

const streamDesigns = createPollingQueryStream({
  intervalMs: STREAM_INTERVAL_MS,
  poll: projectDesigns,
});

export default createRPCEndpoint(WebDesignRpcSchema, {
  getWebDesignConfiguration(_args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);

    return {
      agentTypes: webDesignService.getAgentTypes(),
      webDesignDirectory: webDesignService.getWebDesignDirectoryName(),
      serveDirectory: webDesignService.getServeDirectory(),
      previewBaseUrl: webDesignService.getPreviewBaseUrl() ?? null,
    };
  },

  async listFlows(args, app: TokenRingApp) {
    return projectFlows(args, app);
  },

  streamFlows,

  async createFlow(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const flow = await webDesignService.createFlow(args.name);
    bumpDesignRevision();
    return { flow };
  },

  async deleteFlow(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const success = await webDesignService.deleteFlow(args.name);
    bumpDesignRevision();
    return { success };
  },

  async renameFlow(args, app: TokenRingApp) {
    const flow = await app.requireService(WebDesignService).renameFlow(args.name, args.newName);
    bumpDesignRevision();
    return { flow };
  },

  async duplicateFlow(args, app: TokenRingApp) {
    const flow = await app.requireService(WebDesignService).duplicateFlow(args.name, args.newName);
    bumpDesignRevision();
    return { flow };
  },

  async exportFlow(args, app: TokenRingApp) {
    const archive = await app.requireService(WebDesignService).exportFlowArchive(args.name);
    return {
      fileName: archive.fileName,
      mimeType: "application/zip" as const,
      content: Buffer.from(archive.data).toString("base64"),
      fileCount: archive.fileCount,
    };
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

  async renameDesign(args, app: TokenRingApp) {
    const design = await app.requireService(WebDesignService).renameDesign(args.flowName, args.name, args.newFlowName ?? args.flowName, args.newName);
    bumpDesignRevision();
    return { design };
  },

  async duplicateDesign(args, app: TokenRingApp) {
    const design = await app.requireService(WebDesignService).duplicateDesign(args.flowName, args.name, args.newFlowName ?? args.flowName, args.newName);
    bumpDesignRevision();
    return { design };
  },

  async captureDesignScreenshot(args, app: TokenRingApp) {
    const screenshot = await app.requireService(WebDesignService).captureScreenshot(args.flowName, args.name, {
      width: args.width,
      height: args.height,
      save: args.save,
    });
    if (screenshot.savedAs) bumpDesignRevision();
    return {
      savedAs: screenshot.savedAs,
      content: screenshot.base64,
      mimeType: "image/png" as const,
      viewport: screenshot.viewport,
      console: screenshot.console,
    };
  },

  async listDesignHistory(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const versions = await webDesignService.listDesignHistory(args.flowName, args.name);
    return { versions };
  },

  async getDesignVersion(args, app: TokenRingApp) {
    const webDesignService = app.requireService(WebDesignService);
    const version = await webDesignService.getDesignVersion(args.flowName, args.name, args.versionId);
    return { version };
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

    if (args.selectedFlowName === null || args.selectedDesignName === null) {
      webDesignService.clearCurrentDesign(agent);
    } else if (args.selectedFlowName && args.selectedDesignName) {
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
