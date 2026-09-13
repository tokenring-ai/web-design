import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { BrowserService } from "@tokenring-ai/browser";
import { WebDesignServiceConfigSchema } from "../schema.ts";
import WebDesignService from "../WebDesignService.ts";
import screenshotDesign from "./screenshotDesign.ts";

describe("design_screenshot", () => {
  let app: ReturnType<typeof createTestingApp>;
  let agent: ReturnType<typeof createTestingAgent>;
  let webDesignService: WebDesignService;
  let tempDir: string;
  const navigatedTo: string[] = [];
  const resizedTo: { width: number; height: number }[] = [];
  const tempDirs: string[] = [];

  beforeEach(() => {
    app = createTestingApp();
    navigatedTo.length = 0;
    resizedTo.length = 0;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-design-screenshot-"));
    tempDirs.push(tempDir);

    webDesignService = new WebDesignService(app as unknown as TokenRingApp);
    webDesignService.reconfigure(
      WebDesignServiceConfigSchema.parse({ webDesignDirectory: path.join(tempDir, "web-design"), previewBaseUrl: "http://127.0.0.1:3210/" }),
    );
    app.addService(WebDesignService, webDesignService);

    const record = {
      viewport: { width: 1280, height: 720 },
      consoleMessages: [
        { level: "error", text: "Uncaught TypeError: x is not a function", navigationGeneration: 1 },
        { level: "info", text: "page ready", navigationGeneration: 1 },
      ],
      navigationGeneration: 1,
      view: {
        async resize(width: number, height: number) {
          resizedTo.push({ width, height });
        },
        async screenshot() {
          return "fakepngbase64";
        },
      },
    };
    const session = {
      profile: { timeouts: { action: 30000, navigation: 60000 } },
      ensureView: () => record,
      async navigate(_record: unknown, url: string) {
        navigatedTo.push(url);
      },
      async run(_record: unknown, operation: () => unknown) {
        return operation();
      },
    };
    const browserService = {
      name: "BrowserService",
      description: "test double",
      ensureSession: () => session,
      syncState: () => {},
    };
    app.addService(BrowserService, browserService as never);

    agent = createTestingAgent(app);
  });

  afterEach(() => {
    app.shutdown();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("captures a screenshot and reports console errors as an LLM attachment", async () => {
    await webDesignService.createDesign("landing", "index", "<h1>Landing</h1>");

    const result = await screenshotDesign.execute({ flowName: "landing", name: "index.html" }, agent);

    expect(result.message).toContain('screenshot of "landing/index.html"');
    const attachment = result.attachments?.[0];
    expect(attachment).toMatchObject({
      sendToLLM: true,
      name: "index.png",
      mimeType: "image/png",
      encoding: "base64",
      body: "fakepngbase64",
    });

    const parsed = JSON.parse(result.result as string);
    expect(parsed.viewport).toEqual({ width: 1280, height: 720 });
    expect(parsed.console).toContain("Uncaught TypeError");

    // The capture opened the token-gated preview route, not the credential-protected /api/fs.
    expect(navigatedTo).toHaveLength(1);
    const url = new URL(navigatedTo[0] ?? "about:blank");
    expect(url.origin).toBe("http://127.0.0.1:3210");
    expect(url.pathname).toBe("/api/web-design/preview/landing/index.html");
    expect(url.searchParams.get("token")).toBe(webDesignService.getPreviewToken());
  });

  test("resizes the viewport before capturing when dimensions are given", async () => {
    await webDesignService.createDesign("landing", "index", "<h1>Landing</h1>");

    const result = await screenshotDesign.execute({ flowName: "landing", name: "index.html", width: 375, height: 667 }, agent);

    expect(resizedTo).toEqual([{ width: 375, height: 667 }]);
    const parsed = JSON.parse(result.result as string);
    expect(parsed.viewport).toEqual({ width: 375, height: 667 });
  });

  test("throws a tool error when the design does not exist", async () => {
    await expect(screenshotDesign.execute({ flowName: "missing", name: "index.html" }, agent)).rejects.toThrow('Design "missing/index.html" does not exist');
    expect(navigatedTo).toHaveLength(0);
  });
});
