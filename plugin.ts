import path from "node:path";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import { RpcService } from "@tokenring-ai/rpc";
import { WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import config from "./config/index.ts";
import packageJSON from "./package.json" with { type: "json" };
import { bumpDesignRevision } from "./rpc/revision.ts";
import webDesignRPC from "./rpc/webDesign.ts";
import { WebDesignServiceConfigSchema } from "./schema.ts";
import tools from "./tools.ts";
import WebDesignPreviewResource from "./WebDesignPreviewResource.ts";
import WebDesignService from "./WebDesignService.ts";

const packageConfigSchema = z.object({
  webDesign: WebDesignServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Web Design",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    const webDesignService = new WebDesignService(app);
    app.addService(WebDesignService, webDesignService);

    app.waitForService(ChatService, chatService => chatService.addTools(tools));
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(webDesignRPC);
    });
    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Web Design Preview", new WebDesignPreviewResource(app));
    });
    app.waitForService(FileSystemService, fileSystemService => {
      // Bump the design revision on any write under the design directory so the
      // RPC streams pick up changes without rescanning on every tick.
      fileSystemService.onFileWritten(absolutePath => {
        if (absolutePath.startsWith(webDesignService.getWebDesignDirectory() + path.sep)) {
          bumpDesignRevision();
        }
      });
    });
  },
  reconfigure(app, config) {
    app.requireService(WebDesignService).reconfigure(config.webDesign);
  },
  config,
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
