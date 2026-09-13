import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import { FileSystemConfigSchema } from "@tokenring-ai/filesystem/schema";
import { WebDesignServiceConfigSchema } from "./schema.ts";
import WebDesignService from "./WebDesignService.ts";

describe("WebDesignService", () => {
  const tempDirs: string[] = [];

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-web-design-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeService(webDesignDirectory: string): WebDesignService {
    const service = new WebDesignService(createTestingApp());
    service.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory }));
    return service;
  }

  /** Provider that mirrors writes to the real filesystem so archive reads see content. */
  function createDiskProvider() {
    return {
      async *getDirectoryTree() {},
      async writeFile(filePath: string, content: string | Buffer) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content);
        return true;
      },
      async appendFile(filePath: string, content: string | Buffer) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.appendFile(filePath, content);
        return true;
      },
      async deleteFile(filePath: string) {
        await fs.promises.rm(filePath, { force: true });
        return true;
      },
      async readFile(filePath: string) {
        try {
          return await fs.promises.readFile(filePath);
        } catch {
          return null;
        }
      },
      async exists(filePath: string) {
        try {
          await fs.promises.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      async stat(filePath: string) {
        try {
          const stat = await fs.promises.stat(filePath);
          return { path: filePath, exists: true as const, isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size };
        } catch {
          return { path: filePath, exists: false as const };
        }
      },
      async createDirectory() {
        return true;
      },
    };
  }

  /**
   * Service whose app also registers a FileSystemService over the same workspace,
   * so design saves archive and history reads proxy to the archive.
   */
  function makeServiceWithFileSystem(): WebDesignService {
    const workspace = tempDir();
    const app = new TokenRingApp({
      app: {
        workingDirectory: workspace,
        workspaceDirectory: workspace,
        configDirectories: [],
        shutdownMonitorIntervalMs: 2000,
        serviceRestartDelayMs: 5000,
        printLogs: false,
      },
    });
    const fileSystem = new FileSystemService(app, FileSystemConfigSchema.parse({ agentDefaults: { provider: "disk", selectedFiles: [] } }));
    fileSystem.registerFileSystemProvider("disk", createDiskProvider() as never);
    app.addService(FileSystemService, fileSystem);
    fileSystem.start();

    const service = new WebDesignService(app);
    service.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory: path.join(workspace, "web-design") }));
    return service;
  }

  test("listFlows returns an empty array when the directory doesn't exist", async () => {
    const service = makeService(path.join(tempDir(), "missing"));
    expect(await service.listFlows()).toEqual([]);
  });

  test("createFlow creates an empty flow directory", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    const flow = await service.createFlow("onboarding");
    expect(flow).toMatchObject({ name: "onboarding", designCount: 0 });
    expect(fs.existsSync(path.join(dir, "onboarding"))).toBe(true);
  });

  test("createFlow throws when the flow already exists", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createFlow("dup");
    await expect(service.createFlow("dup")).rejects.toThrow('Flow "dup" already exists');
  });

  test("createDesign auto-creates its flow and getDesign reads it back", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    const created = await service.createDesign("onboarding", "welcome", "<h1>Hello</h1>");
    expect(created).toMatchObject({ flowName: "onboarding", name: "welcome.html", content: "<h1>Hello</h1>", mimeType: "text/html", encoding: "utf8" });
    expect(fs.existsSync(path.join(dir, "onboarding", "welcome.html"))).toBe(true);

    const fetched = await service.getDesign("onboarding", "welcome");
    expect(fetched?.content).toBe("<h1>Hello</h1>");
  });

  test("createDesign throws when the design already exists", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("flow", "page", "one");
    await expect(service.createDesign("flow", "page", "two")).rejects.toThrow('File "page" already exists in flow "flow"');
  });

  test("updateDesign overwrites existing content and creates missing designs", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("flow", "page", "v1");
    const updated = await service.updateDesign("flow", "page", "v2");
    expect(updated.content).toBe("v2");
    expect((await service.getDesign("flow", "page"))?.content).toBe("v2");
  });

  test("deleteDesign removes an existing design and reports missing ones", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("flow", "temp", "content");
    expect(await service.deleteDesign("flow", "temp")).toBe(true);
    expect(await service.getDesign("flow", "temp")).toBeNull();
    expect(await service.deleteDesign("flow", "temp")).toBe(false);
  });

  test("deleteFlow removes a flow and all of its designs", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("flow", "a", "a");
    await service.createDesign("flow", "b", "b");
    expect(await service.deleteFlow("flow")).toBe(true);
    expect(fs.existsSync(path.join(dir, "flow"))).toBe(false);
    expect(await service.deleteFlow("flow")).toBe(false);
  });

  test("listFlows reports file counts and listDesigns includes all flow files sorted by name", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("flow", "b-page", "b");
    await service.createDesign("flow", "a-page", "a");
    fs.writeFileSync(path.join(dir, "flow", "notes.txt"), "supporting content");

    const flows = await service.listFlows();
    expect(flows).toEqual([expect.objectContaining({ name: "flow", designCount: 3 })]);

    const designs = await service.listDesigns("flow");
    expect(designs.map(d => d.name)).toEqual(["a-page.html", "b-page.html", "notes.txt"]);
    expect(designs.find(d => d.name === "notes.txt")?.mimeType).toBe("text/plain");
  });

  test("listFlows and listDesigns skip hidden and invalid names", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("valid-flow", "index.html", "<h1>ok</h1>");
    fs.mkdirSync(path.join(dir, ".hidden"));
    fs.mkdirSync(path.join(dir, "has space"));
    fs.writeFileSync(path.join(dir, "valid-flow", ".DS_Store"), "junk");
    fs.writeFileSync(path.join(dir, "valid-flow", "notes.txt"), "ok");

    const flows = await service.listFlows();
    expect(flows.map(f => f.name)).toEqual(["valid-flow"]);
    expect(flows[0]?.designCount).toBe(2);

    const designs = await service.listDesigns("valid-flow");
    expect(designs.map(d => d.name)).toEqual(["index.html", "notes.txt"]);
  });

  test("stores linked text and binary assets with their original file names", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("site", "index.html", '<link rel="stylesheet" href="styles.css">');
    await service.createDesign("site", "styles.css", "body { color: rebeccapurple; }");
    await service.createDesign("site", "pixel.png", Buffer.from([0, 1, 2, 3]).toString("base64"), "base64");

    expect(fs.readFileSync(path.join(dir, "site", "styles.css"), "utf8")).toContain("rebeccapurple");
    expect([...fs.readFileSync(path.join(dir, "site", "pixel.png"))]).toEqual([0, 1, 2, 3]);
    expect(await service.getDesign("site", "pixel.png")).toMatchObject({
      name: "pixel.png",
      encoding: "base64",
      mimeType: "image/png",
      content: Buffer.from([0, 1, 2, 3]).toString("base64"),
    });
  });

  test("getServeDirectory is workspace-relative so /api/fs can host previews", () => {
    const working = tempDir();
    const workspace = path.join(working, ".tokenring");
    fs.mkdirSync(workspace);
    const app = new TokenRingApp({
      app: {
        workingDirectory: working,
        workspaceDirectory: workspace,
        configDirectories: [],
        shutdownMonitorIntervalMs: 2000,
        serviceRestartDelayMs: 5000,
        printLogs: false,
      },
    });
    const service = new WebDesignService(app);
    service.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory: "web-design" }));

    expect(service.getServeDirectory()).toBe("web-design");
  });

  test("getServeDirectory throws when the design directory is outside the workspace directory", () => {
    const working = tempDir();
    const workspace = path.join(working, ".tokenring");
    fs.mkdirSync(workspace);
    const app = new TokenRingApp({
      app: {
        workingDirectory: working,
        workspaceDirectory: workspace,
        configDirectories: [],
        shutdownMonitorIntervalMs: 2000,
        serviceRestartDelayMs: 5000,
        printLogs: false,
      },
    });
    const service = new WebDesignService(app);
    // An absolute directory outside the workspace cannot be served via /api/fs.
    service.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory: tempDir() }));
    expect(() => service.getServeDirectory()).toThrow(/outside the workspace directory/);
  });

  test("rejects invalid flow and design names", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await expect(service.createFlow("../escape")).rejects.toThrow("Invalid flow name");
    await expect(service.createDesign("flow", "has space.css", "x")).rejects.toThrow("Invalid file name");
    await expect(service.createDesign("flow", "../escape.css", "x")).rejects.toThrow("Invalid file name");
  });

  test("design history proxies to the filesystem archive", async () => {
    const service = makeServiceWithFileSystem();

    await service.createDesign("landing", "index", "<h1>v1</h1>");
    await service.updateDesign("landing", "index", "<h1>v2</h1>");
    await service.updateDesign("landing", "index", "<h1>v3</h1>");

    // Creation archives nothing; each overwrite archives the previous content.
    const versions = await service.listDesignHistory("landing", "index");
    expect(versions).toHaveLength(2);

    const first = await service.getDesignVersion("landing", "index", versions[1]!.id);
    expect(first).toMatchObject({ content: "<h1>v1</h1>", encoding: "utf8", mimeType: "text/html" });

    // The archive lives outside the design directory, so listings stay clean.
    const designs = await service.listDesigns("landing");
    expect(designs.map(d => d.name)).toEqual(["index.html"]);
    expect(await service.getDesignVersion("landing", "index", "v-missing")).toBeNull();
    expect(await service.listDesignHistory("landing", "nope.html")).toEqual([]);
  });

  test("designs may be nested in subfolders within a flow", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await service.createDesign("site", "assets/logo.svg", "<svg/>");
    await service.createDesign("site", "pages/checkout", "<h1>checkout</h1>");

    const designs = await service.listDesigns("site");
    expect(designs.map(d => d.name)).toEqual(["assets/logo.svg", "pages/checkout.html"]);
    expect((await service.getDesign("site", "pages/checkout"))?.name).toBe("pages/checkout.html");
    expect(fs.existsSync(path.join(dir, "site", "pages", "checkout.html"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "site", "assets", "logo.svg"))).toBe(true);

    await expect(service.createDesign("site", "../escape.css", "x")).rejects.toThrow("Invalid file name");
  });

  test("flows report their absolute directory", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    const flow = await service.createFlow("landing");
    expect(flow.absolutePath).toBe(path.join(dir, "landing"));
    expect(service.getFlowPath("landing")).toBe(path.join(dir, "landing"));
    expect((await service.listFlows())[0]?.absolutePath).toBe(path.join(dir, "landing"));
  });

  test("listFlows and listDesigns surface non-ENOENT filesystem errors", async () => {
    const dir = tempDir();
    // A regular file where a directory is expected makes readdir fail with ENOTDIR,
    // which must not be silently swallowed the way ENOENT is.
    const blocking = path.join(dir, "blocking");
    fs.writeFileSync(blocking, "not a flow", "utf8");

    const service = makeService(dir);
    await expect(service.listDesigns("blocking")).rejects.toThrow();

    const fileRootService = makeService(path.join(blocking, "nested"));
    await expect(fileRootService.listFlows()).rejects.toThrow();
  });
});
