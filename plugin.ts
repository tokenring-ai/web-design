import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import packageJSON from "./package.json" with { type: "json" };
import webDesignRPC from "./rpc/webDesign.ts";
import { WebDesignServiceConfigSchema } from "./schema.ts";
import tools from "./tools.ts";
import WebDesignService from "./WebDesignService.ts";

const packageConfigSchema = z.object({
  webDesign: WebDesignServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Web Design",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    const webDesign = new WebDesignService(config.webDesign);
    app.addServices(webDesign);
    app.waitForService(ChatService, chatService => chatService.addTools(...tools));
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(webDesignRPC);
    });
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
