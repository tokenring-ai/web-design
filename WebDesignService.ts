import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { type Design, type DesignSummary, type FlowSummary, type ParsedWebDesignConfig, WebDesignServiceConfigSchema } from "./schema.ts";
import { WebDesignState } from "./state/WebDesignState.ts";

const FLOW_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertValidFlowName(name: string): void {
  if (!FLOW_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid flow name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`);
  }
}

function normalizeFileName(name: string): string {
  if (!FILE_NAME_PATTERN.test(name) || name === "." || name === "..") {
    throw new Error(
      `Invalid file name "${name}". File names must start with a letter or number and may only contain letters, numbers, dots, hyphens, and underscores.`,
    );
  }
  // Preserve compatibility with the original API, where callers supplied a
  // design slug and the service added .html.
  return name.includes(".") ? name : `${name}.html`;
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".htm": "text/html",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jsx": "text/javascript",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".md": "text/markdown",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".txt": "text/plain",
  ".webmanifest": "application/json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
};

function mimeTypeForFile(fileName: string): string {
  return MIME_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml" || mimeType === "image/svg+xml";
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

  private options = WebDesignServiceConfigSchema.parse({});

  constructor(private app: TokenRingApp) {}

  attach(agent: Agent): void {
    agent.initializeState(WebDesignState, {});
  }

  reconfigure(options: ParsedWebDesignConfig): void {
    this.options = options;
  }

  /** Agent types configured for web design (from WebDesignServiceConfigSchema.agentTypes). */
  getAgentTypes(): string[] {
    return [...this.options.agentTypes];
  }

  /** Configured directory name relative to the workspace (e.g. `web-design`). */
  getWebDesignDirectoryName(): string {
    return this.options.webDesignDirectory;
  }

  getWebDesignDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.options.webDesignDirectory);
  }

  getCurrentDesign(agent: Agent): Design | undefined {
    return agent.getState(WebDesignState).currentDesign;
  }

  async selectDesign(flowName: string, designName: string, agent: Agent): Promise<Design | null> {
    const design = await this.getDesign(flowName, designName);
    agent.mutateState(WebDesignState, state => {
      state.currentDesign = design ?? undefined;
    });
    return design;
  }

  clearCurrentDesign(agent: Agent): void {
    agent.mutateState(WebDesignState, state => {
      state.currentDesign = undefined;
    });
  }

  private resolveFlowDirectory(flowName: string): string {
    assertValidFlowName(flowName);
    return path.join(this.getWebDesignDirectory(), flowName);
  }

  private resolveDesignPath(flowName: string, designName: string): string {
    return path.join(this.resolveFlowDirectory(flowName), normalizeFileName(designName));
  }

  async listFlows(): Promise<FlowSummary[]> {
    const root = this.getWebDesignDirectory();
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
      const entries = await fs.readdir(flowDir, { withFileTypes: true });
      return entries.filter(entry => entry.isFile()).length;
    } catch {
      return 0;
    }
  }

  async createFlow(flowName: string): Promise<FlowSummary> {
    const flowDir = this.resolveFlowDirectory(flowName);
    if (await pathExists(flowDir)) {
      throw new Error(`Flow "${flowName}" already exists`);
    }
    await fs.mkdir(flowDir, { recursive: true });
    const stat = await fs.stat(flowDir);
    return { name: flowName, designCount: 0, updatedAt: stat.mtime.toISOString() };
  }

  async deleteFlow(flowName: string): Promise<boolean> {
    const flowDir = this.resolveFlowDirectory(flowName);
    try {
      await fs.rm(flowDir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async listDesigns(flowName: string): Promise<DesignSummary[]> {
    const flowDir = this.resolveFlowDirectory(flowName);
    let entries: Dirent[];
    try {
      entries = await fs.readdir(flowDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const designs: DesignSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.stat(path.join(flowDir, entry.name));
      designs.push({
        flowName,
        name: entry.name,
        size: stat.size,
        mimeType: mimeTypeForFile(entry.name),
        updatedAt: stat.mtime.toISOString(),
      });
    }

    return designs.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getDesign(flowName: string, designName: string): Promise<Design | null> {
    const filePath = this.resolveDesignPath(flowName, designName);
    const fileName = path.basename(filePath);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }
    const mimeType = mimeTypeForFile(fileName);
    const encoding = isTextMimeType(mimeType) ? "utf8" : "base64";
    const content = await fs.readFile(filePath, encoding);
    return { flowName, name: fileName, content, encoding, mimeType, size: stat.size, updatedAt: stat.mtime.toISOString() };
  }

  async createDesign(flowName: string, designName: string, content: string, encoding: "utf8" | "base64" = "utf8"): Promise<Design> {
    const filePath = this.resolveDesignPath(flowName, designName);
    if (await pathExists(filePath)) {
      throw new Error(`File "${designName}" already exists in flow "${flowName}"`);
    }
    return this.writeDesignFile(flowName, designName, content, encoding);
  }

  async updateDesign(flowName: string, designName: string, content: string, encoding: "utf8" | "base64" = "utf8"): Promise<Design> {
    return this.writeDesignFile(flowName, designName, content, encoding);
  }

  async deleteDesign(flowName: string, designName: string): Promise<boolean> {
    const filePath = this.resolveDesignPath(flowName, designName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async writeDesignFile(flowName: string, designName: string, content: string, encoding: "utf8" | "base64"): Promise<Design> {
    const filePath = this.resolveDesignPath(flowName, designName);
    const fileName = path.basename(filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, encoding);
    const stat = await fs.stat(filePath);
    return {
      flowName,
      name: fileName,
      content,
      encoding,
      mimeType: mimeTypeForFile(fileName),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }
}
