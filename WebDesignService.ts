import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCreationContext } from "@tokenring-ai/agent/types";
import type { TokenRingService } from "@tokenring-ai/app/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import { type Design, type DesignSummary, type FlowSummary, type ParsedWebDesignConfig, WebDesignAgentConfigSchema } from "./schema.ts";
import { WebDesignState } from "./state/WebDesignState.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".html";

function assertValidName(name: string, kind: "flow" | "design"): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid ${kind} name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`,
    );
  }
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

export default class WebDesignService implements TokenRingService {
  readonly name = "WebDesignService";
  description = "Figma-style design flows and designs, backed by files on disk";

  constructor(private options: ParsedWebDesignConfig) {}

  attach(agent: Agent, creationContext: AgentCreationContext): void {
    const agentConfig = deepClone(this.options.agentDefaults, agent.getAgentConfigSlice("webDesign", WebDesignAgentConfigSchema));
    const initialState = agent.initializeState(WebDesignState, agentConfig);
    creationContext.items.push(`Web Design Directory: ${initialState.webDesignDirectory}`);
  }

  getDefaultWebDesignDirectory(): string {
    return this.options.agentDefaults.webDesignDirectory;
  }

  getWebDesignDirectory(agent: Agent): string {
    return agent.getState(WebDesignState).webDesignDirectory;
  }

  private resolveFlowDirectory(root: string, flowName: string): string {
    assertValidName(flowName, "flow");
    return path.join(root, flowName);
  }

  private resolveDesignPath(root: string, flowName: string, designName: string): string {
    assertValidName(designName, "design");
    return path.join(this.resolveFlowDirectory(root, flowName), `${designName}${EXTENSION}`);
  }

  async listFlows(root: string): Promise<FlowSummary[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const flows: FlowSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const flowDir = path.join(root, entry.name);
      const stat = await fs.stat(flowDir);
      const designCount = await this.countDesigns(flowDir);
      flows.push({ name: entry.name, designCount, updatedAt: stat.mtime.toISOString() });
    }

    return flows.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async countDesigns(flowDir: string): Promise<number> {
    try {
      const files = await fs.readdir(flowDir);
      return files.filter(f => f.endsWith(EXTENSION)).length;
    } catch {
      return 0;
    }
  }

  async createFlow(root: string, flowName: string): Promise<FlowSummary> {
    const flowDir = this.resolveFlowDirectory(root, flowName);
    if (await pathExists(flowDir)) {
      throw new Error(`Flow "${flowName}" already exists`);
    }
    await fs.mkdir(flowDir, { recursive: true });
    const stat = await fs.stat(flowDir);
    return { name: flowName, designCount: 0, updatedAt: stat.mtime.toISOString() };
  }

  async deleteFlow(root: string, flowName: string): Promise<boolean> {
    const flowDir = this.resolveFlowDirectory(root, flowName);
    try {
      await fs.rm(flowDir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async listDesigns(root: string, flowName: string): Promise<DesignSummary[]> {
    const flowDir = this.resolveFlowDirectory(root, flowName);
    let entries: string[];
    try {
      entries = await fs.readdir(flowDir);
    } catch {
      return [];
    }

    const designs: DesignSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;
      const stat = await fs.stat(path.join(flowDir, entry));
      if (!stat.isFile()) continue;
      designs.push({ flowName, name: entry.slice(0, -EXTENSION.length), size: stat.size, updatedAt: stat.mtime.toISOString() });
    }

    return designs.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getDesign(root: string, flowName: string, designName: string): Promise<Design | null> {
    const filePath = this.resolveDesignPath(root, flowName, designName);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }
    const content = await fs.readFile(filePath, "utf-8");
    return { flowName, name: designName, content, size: stat.size, updatedAt: stat.mtime.toISOString() };
  }

  async createDesign(root: string, flowName: string, designName: string, content: string): Promise<Design> {
    const filePath = this.resolveDesignPath(root, flowName, designName);
    if (await pathExists(filePath)) {
      throw new Error(`Design "${designName}" already exists in flow "${flowName}"`);
    }
    return this.writeDesignFile(root, flowName, designName, content);
  }

  async updateDesign(root: string, flowName: string, designName: string, content: string): Promise<Design> {
    return this.writeDesignFile(root, flowName, designName, content);
  }

  async deleteDesign(root: string, flowName: string, designName: string): Promise<boolean> {
    const filePath = this.resolveDesignPath(root, flowName, designName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async writeDesignFile(root: string, flowName: string, designName: string, content: string): Promise<Design> {
    const filePath = this.resolveDesignPath(root, flowName, designName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    const stat = await fs.stat(filePath);
    return { flowName, name: designName, content, size: stat.size, updatedAt: stat.mtime.toISOString() };
  }
}
