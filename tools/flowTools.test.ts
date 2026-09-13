import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { WebDesignServiceConfigSchema } from "../schema.ts";
import WebDesignService from "../WebDesignService.ts";
import createFlow from "./createFlow.ts";
import listFlows from "./listFlows.ts";

describe("flow tools", () => {
  let app: ReturnType<typeof createTestingApp>;
  let agent: ReturnType<typeof createTestingAgent>;
  let webDesignService: WebDesignService;
  let tempDir: string;
  const tempDirs: string[] = [];

  beforeEach(() => {
    app = createTestingApp();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-flow-tools-"));
    tempDirs.push(tempDir);

    webDesignService = new WebDesignService(app as unknown as TokenRingApp);
    webDesignService.reconfigure(WebDesignServiceConfigSchema.parse({ webDesignDirectory: path.join(tempDir, "web-design") }));
    app.addService(WebDesignService, webDesignService);

    agent = createTestingAgent(app);
  });

  test("flow_create returns the absolute directory to write designs into", async () => {
    const result = await createFlow.execute({ name: "onboarding" }, agent);

    const payload = JSON.parse(result.result as string);
    expect(payload.absolutePath).toBe(path.join(tempDir, "web-design", "onboarding"));
    expect(payload.hint).toContain("file_write");
    expect(fs.existsSync(path.join(tempDir, "web-design", "onboarding"))).toBe(true);
  });

  test("flow_list reports each flow's absolute directory", async () => {
    await webDesignService.createFlow("checkout");

    const result = await listFlows.execute({}, agent);

    const payload = JSON.parse(result.result as string);
    expect(payload.flows).toHaveLength(1);
    expect(payload.flows[0]).toMatchObject({
      name: "checkout",
      absolutePath: path.join(tempDir, "web-design", "checkout"),
    });
  });
});
