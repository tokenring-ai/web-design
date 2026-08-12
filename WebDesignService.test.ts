import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
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

  test("rejects invalid flow and design names", async () => {
    const dir = tempDir();
    const service = makeService(dir);

    await expect(service.createFlow("../escape")).rejects.toThrow("Invalid flow name");
    await expect(service.createDesign("flow", "has space.css", "x")).rejects.toThrow("Invalid file name");
    await expect(service.createDesign("flow", "../escape.css", "x")).rejects.toThrow("Invalid file name");
  });
});
