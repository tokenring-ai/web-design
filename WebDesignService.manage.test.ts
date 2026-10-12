import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { BrowserService } from "@tokenring-ai/browser";
import { WebHostService } from "@tokenring-ai/web-host";
import getCurrentDesignContext from "./contextHandlers/currentDesign.ts";
import { WebDesignServiceConfigSchema } from "./schema.ts";
import { screenshotFileName } from "./screenshot/captureDesignScreenshot.ts";
import { WebDesignState } from "./state/WebDesignState.ts";
import WebDesignService from "./WebDesignService.ts";
import { crc32 } from "./zip.ts";

describe("WebDesignService rename, duplicate, export and screenshot", () => {
  const tempDirs: string[] = [];

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-web-design-manage-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  function makeService(webDesignDirectory: string, app = createTestingApp()): WebDesignService {
    const service = new WebDesignService(app as unknown as TokenRingApp);
    service.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory, previewBaseUrl: "http://127.0.0.1:3210/" }));
    return service;
  }

  test("renameFlow moves the directory and refuses collisions", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createDesign("onboarding", "index.html", "<h1>A</h1>");
    await service.createFlow("taken");

    await expect(service.renameFlow("onboarding", "taken")).rejects.toThrow('Flow "taken" already exists');
    await expect(service.renameFlow("missing", "other")).rejects.toThrow('Flow "missing" does not exist');
    await expect(service.renameFlow("onboarding", "../escape")).rejects.toThrow("Invalid flow name");

    const flow = await service.renameFlow("onboarding", "welcome");
    expect(flow).toMatchObject({ name: "welcome", designCount: 1 });
    expect(fs.existsSync(path.join(dir, "onboarding"))).toBe(false);
    expect((await service.getDesign("welcome", "index.html"))?.content).toBe("<h1>A</h1>");
  });

  test("duplicateFlow copies design files but skips dot-directories", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createDesign("site", "index.html", "<h1>Site</h1>");
    await service.createDesign("site", "assets/logo.png", Buffer.from([1, 2, 3]).toString("base64"), "base64");
    fs.mkdirSync(path.join(dir, "site", ".history"));
    fs.writeFileSync(path.join(dir, "site", ".history", "old.html"), "old");

    const flow = await service.duplicateFlow("site", "site-copy");
    expect(flow.designCount).toBe(2);
    expect((await service.listDesigns("site-copy")).map(design => design.name)).toEqual(["assets/logo.png", "index.html"]);
    expect(fs.existsSync(path.join(dir, "site-copy", ".history"))).toBe(false);
    await expect(service.duplicateFlow("site", "site-copy")).rejects.toThrow("already exists");
  });

  test("renameDesign and duplicateDesign work within and across flows without overwriting", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    await service.createDesign("a", "index.html", "<h1>Index</h1>");
    await service.createDesign("a", "other.html", "<h1>Other</h1>");
    await service.createFlow("b");

    await expect(service.renameDesign("a", "index.html", "a", "other.html")).rejects.toThrow('File "other.html" already exists in flow "a"');
    await expect(service.renameDesign("a", "missing.html", "a", "x.html")).rejects.toThrow("does not exist");

    const renamed = await service.renameDesign("a", "index.html", "a", "pages/home.html");
    expect(renamed).toMatchObject({ flowName: "a", name: "pages/home.html", content: "<h1>Index</h1>" });
    expect(await service.getDesign("a", "index.html")).toBeNull();

    const moved = await service.renameDesign("a", "other.html", "b", "other");
    expect(moved.name).toBe("other.html");
    expect(await service.getDesign("b", "other.html")).not.toBeNull();

    const copy = await service.duplicateDesign("a", "pages/home.html", "b", "home-copy.html");
    expect(copy.content).toBe("<h1>Index</h1>");
    expect(await service.getDesign("a", "pages/home.html")).not.toBeNull();
    await expect(service.duplicateDesign("a", "pages/home.html", "b", "home-copy.html")).rejects.toThrow("already exists");
  });

  test("exportFlowArchive produces a valid zip under a flow folder", async () => {
    const dir = tempDir();
    const service = makeService(dir);
    const html = `<h1>${"Repeated content ".repeat(50)}</h1>`;
    await service.createDesign("landing", "index.html", html);
    await service.createDesign("landing", "assets/dot.bin", Buffer.from([0, 255, 7]).toString("base64"), "base64");

    const archive = await service.exportFlowArchive("landing");
    expect(archive.fileName).toBe("landing.zip");
    expect(archive.fileCount).toBe(2);
    const bytes = Buffer.from(archive.data);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
    expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(2);

    const zipPath = path.join(tempDir(), "landing.zip");
    fs.writeFileSync(zipPath, bytes);
    const unzip = spawnSync("unzip", ["-p", zipPath, "landing/index.html"]);
    if (unzip.error) return; // unzip unavailable on this machine; header checks above still ran
    expect(unzip.status).toBe(0);
    expect(unzip.stdout.toString()).toBe(html);
    const binary = spawnSync("unzip", ["-p", zipPath, "landing/assets/dot.bin"]);
    expect([...binary.stdout]).toEqual([0, 255, 7]);

    await expect(service.exportFlowArchive("missing")).rejects.toThrow('Flow "missing" does not exist');
  });

  test("crc32 matches the reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("captureScreenshot uses a throwaway session, closes it and saves the PNG into the flow", async () => {
    const dir = tempDir();
    const app = createTestingApp();
    const created: { name: string; profile: string }[] = [];
    const closed: string[] = [];
    const navigatedTo: string[] = [];
    const record = {
      viewport: { width: 1280, height: 720 },
      consoleMessages: [],
      navigationGeneration: 0,
      view: {
        async resize() {},
        async screenshot() {
          return Buffer.from("png-bytes").toString("base64");
        },
      },
    };
    const browserService = {
      name: "BrowserService",
      description: "test double",
      createSession(name: string, profile: string) {
        created.push({ name, profile });
        return {
          profile: { timeouts: { action: 1000 } },
          ensureView: () => record,
          async navigate(_record: unknown, url: string) {
            navigatedTo.push(url);
          },
          async run(_record: unknown, operation: () => unknown) {
            return operation();
          },
        };
      },
      closeSession(name: string) {
        closed.push(name);
      },
    };
    app.addService(BrowserService, browserService as never);
    app.addService(WebHostService, { name: "WebHostService", description: "test double", getURL: () => new URL("http://unused") } as never);
    const service = makeService(dir, app);
    await service.createDesign("landing", "index.html", "<h1>Hi</h1>");

    const result = await service.captureScreenshot("landing", "index.html", { width: 375, height: 667 });
    expect(created).toHaveLength(1);
    expect(created[0]?.profile).toBe("default");
    expect(closed).toEqual([created[0]?.name ?? ""]);
    expect(new URL(navigatedTo[0] ?? "about:blank").origin).toBe("http://127.0.0.1:3210");
    expect(result.viewport).toEqual({ width: 375, height: 667 });
    expect(result.savedAs).toMatch(/^screenshots\/index-375x667-\d{8}T\d{6}Z\.png$/);
    const saved = await service.getDesign("landing", result.savedAs ?? "");
    expect(saved?.encoding).toBe("base64");
    expect(Buffer.from(saved?.content ?? "", "base64").toString()).toBe("png-bytes");

    const unsaved = await service.captureScreenshot("landing", "index.html", { save: false });
    expect(unsaved.savedAs).toBeNull();
    expect(closed).toHaveLength(2);

    await expect(service.captureScreenshot("landing", "missing.html")).rejects.toThrow('Design "landing/missing.html" does not exist');
    expect(closed).toHaveLength(3);
  });

  test("screenshotFileName derives a timestamped name under screenshots/", () => {
    expect(screenshotFileName("pages/home.html", { width: 1280, height: 720 }, new Date("2026-07-12T10:15:00.123Z"))).toBe(
      "screenshots/home-1280x720-20260712T101500Z.png",
    );
  });

  test("selecting a design feeds the current-design context without copying its content", async () => {
    const dir = tempDir();
    const app = createTestingApp();
    const service = makeService(dir, app);
    app.addService(WebDesignService, service);
    const agent = createTestingAgent(app);
    service.attach(agent);
    await service.createDesign("landing", "index.html", "<h1>Big body</h1>");

    const noContext = [...getCurrentDesignContext({ agent } as never)];
    expect(noContext).toHaveLength(0);

    await service.selectDesign("landing", "index.html", agent);
    expect(agent.getState(WebDesignState).currentDesign?.content).toBe("");
    const items = [...getCurrentDesignContext({ agent } as never)];
    expect(items).toHaveLength(1);
    const text = JSON.stringify(items[0]?.content);
    expect(text).toContain("landing/index.html");
    expect(text).toContain(path.join(dir, "landing"));

    service.clearCurrentDesign(agent);
    expect([...getCurrentDesignContext({ agent } as never)]).toHaveLength(0);
  });
});
