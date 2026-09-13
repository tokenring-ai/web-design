import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import {
  type Design,
  type DesignSummary,
  type DesignVersionSummary,
  type FlowSummary,
  type ParsedWebDesignConfig,
  WebDesignServiceConfigSchema,
} from "./schema.ts";
import { WebDesignState } from "./state/WebDesignState.ts";

const FLOW_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
/** One path segment of a design file name (flows may contain nested paths). */
const FILE_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertValidFlowName(name: string): void {
  if (!FLOW_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid flow name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`);
  }
}

/**
 * Validates a design file name, which may be nested inside the flow
 * ("assets/logo.png", "pages/checkout.html"). Each path segment follows the
 * classic file-name rules; a missing extension on the last segment keeps the
 * original API behavior of appending .html.
 */
function normalizeFileName(name: string): string {
  const segments = name.split("/");
  if (segments.length === 0 || segments.some(segment => segment === "." || segment === ".." || !FILE_SEGMENT_PATTERN.test(segment))) {
    throw new Error(
      `Invalid file name "${name}". File names may use / for subfolders, and each segment must start with a letter or number and may only contain letters, numbers, dots, hyphens, and underscores.`,
    );
  }
  const lastSegment = segments[segments.length - 1] ?? "";
  return lastSegment.includes(".") ? name : `${name}.html`;
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

  /** Per-boot secret gating the unauthenticated-design preview HTTP resource. */
  private readonly previewToken = randomBytes(32).toString("hex");

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

  /** Filesystem provider used in /api/fs preview URLs (e.g. `posix`). */
  getFsProvider(): string {
    return this.options.fsProvider;
  }

  /** Base URL for agents to open hosted design previews, or null to use the web host URL. */
  getPreviewBaseUrl(): string | undefined {
    return this.options.previewBaseUrl;
  }

  /** Constant-time check of the token that gates the preview HTTP resource. */
  verifyPreviewToken(token: string): boolean {
    const expected = Buffer.from(this.previewToken, "hex");
    const provided = Buffer.from(token, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  /** Secret token for building preview URLs (used by the design_screenshot tool). */
  getPreviewToken(): string {
    return this.previewToken;
  }

  getWebDesignDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.options.webDesignDirectory);
  }

  /**
   * Path to the web-design directory relative to the WORKSPACE directory.
   * `/api/fs/{provider}/...` resolves relative paths against the workspace
   * directory. Typically `web-design`.
   */
  getServeDirectory(): string {
    const absolute = this.getWebDesignDirectory();
    const relative = path.relative(this.app.appConfig.workspaceDirectory, absolute);
    if (!relative || relative === ".") {
      throw new Error(`Web design directory resolves to the workspace directory root; set webDesign.webDesignDirectory to a subdirectory`);
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Web design directory "${absolute}" is outside the workspace directory "${this.app.appConfig.workspaceDirectory}" and cannot be served via /api/fs`,
      );
    }
    return relative.split(path.sep).join("/");
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

  /** Absolute path of a flow directory (returned to agents so they can write with file tools). */
  getFlowPath(flowName: string): string {
    return this.resolveFlowDirectory(flowName);
  }

  /** The FileSystemService when present; writes and version history delegate to it. */
  private filesystemService(): FileSystemService | null {
    try {
      return this.app.requireService(FileSystemService);
    } catch {
      return null;
    }
  }

  async listFlows(): Promise<FlowSummary[]> {
    const root = this.getWebDesignDirectory();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const flows: FlowSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !FLOW_NAME_PATTERN.test(entry.name)) continue;
      const flowDir = path.join(root, entry.name);
      const stat = await fs.stat(flowDir);
      const designCount = await this.countDesigns(flowDir);
      flows.push({ name: entry.name, designCount, updatedAt: stat.mtime.toISOString(), absolutePath: flowDir });
    }

    return flows.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async countDesigns(flowDir: string): Promise<number> {
    return (await this.walkDesignFiles(flowDir, flowDir)).length;
  }

  async createFlow(flowName: string): Promise<FlowSummary> {
    const flowDir = this.resolveFlowDirectory(flowName);
    if (await pathExists(flowDir)) {
      throw new Error(`Flow "${flowName}" already exists`);
    }
    await fs.mkdir(flowDir, { recursive: true });
    const stat = await fs.stat(flowDir);
    return { name: flowName, designCount: 0, updatedAt: stat.mtime.toISOString(), absolutePath: flowDir };
  }

  async deleteFlow(flowName: string): Promise<boolean> {
    const flowDir = this.resolveFlowDirectory(flowName);
    try {
      await fs.rm(flowDir, { recursive: true });
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /**
   * Design files within a flow, recursively. Names are flow-relative with "/"
   * separators ("index.html", "assets/logo.png"); dot-directories (legacy
   * `.history`, editor state) and invalid segments are skipped.
   */
  async listDesigns(flowName: string): Promise<DesignSummary[]> {
    const flowDir = this.resolveFlowDirectory(flowName);
    const files = await this.walkDesignFiles(flowDir, flowDir);

    const designs: DesignSummary[] = [];
    for (const [absolutePath, relativeName] of files) {
      const stat = await fs.stat(absolutePath);
      designs.push({
        flowName,
        name: relativeName,
        size: stat.size,
        mimeType: mimeTypeForFile(relativeName),
        updatedAt: stat.mtime.toISOString(),
      });
    }

    return designs.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Recursive walk yielding [absolutePath, flowRelativeName] pairs for valid design files. */
  private async walkDesignFiles(dir: string, flowDir: string): Promise<[string, string][]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const files: [string, string][] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walkDesignFiles(absolutePath, flowDir)));
        continue;
      }
      if (!entry.isFile()) continue;
      const relativeName = path.relative(flowDir, absolutePath).split(path.sep).join("/");
      const valid = relativeName.split("/").every(segment => FILE_SEGMENT_PATTERN.test(segment));
      if (valid) files.push([absolutePath, relativeName]);
    }
    return files;
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
    return {
      flowName,
      name: path.relative(this.resolveFlowDirectory(flowName), filePath).split(path.sep).join("/"),
      content,
      encoding,
      mimeType,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
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

  /**
   * Archived previous versions of a design, newest first. Versioning is a
   * filesystem-plugin concern: every overwrite (editor save, agent file_write,
   * upload) is archived by FileSystemService, so this only proxies.
   */
  async listDesignHistory(flowName: string, designName: string): Promise<DesignVersionSummary[]> {
    const fileSystem = this.filesystemService();
    if (!fileSystem) return [];
    return fileSystem.listVersions(this.workspaceRelativeDesignPath(flowName, designName));
  }

  /** Content of one archived version, or null when the version does not exist. */
  async getDesignVersion(
    flowName: string,
    designName: string,
    versionId: string,
  ): Promise<{ id: string; createdAt: string; content: string; encoding: "utf8" | "base64"; mimeType: string } | null> {
    const fileSystem = this.filesystemService();
    if (!fileSystem) return null;
    const designPath = this.workspaceRelativeDesignPath(flowName, designName);
    const summary = (await fileSystem.listVersions(designPath)).find(version => version.id === versionId);
    if (!summary) return null;
    const content = await fileSystem.readVersion(designPath, versionId);
    if (!content) return null;
    const mimeType = mimeTypeForFile(normalizeFileName(designName));
    const encoding = isTextMimeType(mimeType) ? "utf8" : "base64";
    return { id: summary.id, createdAt: summary.createdAt, content: content.toString(encoding), encoding, mimeType };
  }

  /** Workspace-relative path of a design file, matching how the archive keys versions. */
  private workspaceRelativeDesignPath(flowName: string, designName: string): string {
    return `${this.getServeDirectory()}/${flowName}/${normalizeFileName(designName)}`;
  }

  async deleteDesign(flowName: string, designName: string): Promise<boolean> {
    const filePath = this.resolveDesignPath(flowName, designName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /**
   * Writes through the filesystem service's system write so every save is
   * archived uniformly; falls back to a direct write when FileSystemService is
   * unavailable (minimal installs, some tests).
   */
  private async writeDesignFile(flowName: string, designName: string, content: string, encoding: "utf8" | "base64"): Promise<Design> {
    const filePath = this.resolveDesignPath(flowName, designName);
    const fileName = path.relative(this.resolveFlowDirectory(flowName), filePath).split(path.sep).join("/");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    const fileSystem = this.filesystemService();
    if (fileSystem) {
      await fileSystem.writeSystemFile(path.relative(this.app.appConfig.workspaceDirectory, filePath).split(path.sep).join("/"), payload);
    } else {
      await fs.writeFile(filePath, payload);
    }
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
