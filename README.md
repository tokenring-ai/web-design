# @tokenring-ai/web-design

Figma-style web design flows and designs, backed by files on disk.

## Overview

The `@tokenring-ai/web-design` package provides a simple two-level document store for HTML mockups, using
Figma-familiar terminology:

- A **Design** is a single HTML file — one UI mockup.
- A **Flow** is a named collection of related Designs (e.g. an onboarding flow, a checkout flow).

Designs are typically UI mockups that an agent creates and iterates on while doing frontend work, organized into
Flows, and viewed/edited directly by users in the Web Design app.

## Key Features

- **Flows & Designs**: Designs are grouped into named Flows, stored as `<webDesignDirectory>/<flow>/<design>.html`
- **Shared or Per-Agent Directory**: One configured root directory by default, with optional per-agent overrides
- **CRUD via RPC**: List, create, retrieve, update, and delete flows and designs from the frontend
- **CRUD via Tools**: Agents can list, read, write, and delete flows and designs while doing frontend work
- **Live List Updates**: `streamFlows` / `streamDesigns` poll the directory so the frontend list stays current
- **Auto-vivified Flows**: Writing a design to a flow that doesn't exist yet creates the flow automatically

## Installation

```bash
bun add @tokenring-ai/web-design
```

## Plugin Configuration

Configure the web design plugin in your application config:

```yaml
webDesign:
  agentDefaults:
    webDesignDirectory: ./.tokenring/web-design
```

### Configuration Schema

```typescript
import { WebDesignServiceConfigSchema } from "@tokenring-ai/web-design";

WebDesignServiceConfigSchema = z.object({
  agentDefaults: z.object({
    webDesignDirectory: z.string(),
  }),
});
```

**Configuration Options:**

| Field                              | Type     | Required | Description                        |
|-------------------------------------|----------|----------|-------------------------------------|
| `agentDefaults.webDesignDirectory`  | `string` | Yes      | Directory where design flows are stored |

Agents may override `webDesignDirectory` via their own `webDesign.webDesignDirectory` agent config slice.

## Naming

Flow and design names must start with a letter or number and may only contain letters, numbers, hyphens, and
underscores (`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`). A design named `welcome` in a flow named `onboarding` is stored at
`onboarding/welcome.html` in the web design directory.

## Tools

| Tool           | Display Name                  | Description                                            |
|----------------|--------------------------------|----------------------------------------------------------|
| `flow_list`    | `Web Design/list flows`       | List the design flows in the web design directory        |
| `flow_create`  | `Web Design/create flow`      | Create a new, empty design flow                          |
| `flow_delete`  | `Web Design/delete flow`      | Delete a design flow and all of its designs               |
| `design_list`  | `Web Design/list designs`     | List the designs within a flow                            |
| `design_read`  | `Web Design/read design`      | Read the HTML content of a design                         |
| `design_write` | `Web Design/write design`     | Create or overwrite a design (auto-creates its flow)       |
| `design_delete`| `Web Design/delete design`    | Delete a design                                           |

## Service API

### WebDesignService

```typescript
import { WebDesignService } from "@tokenring-ai/web-design";

const webDesignService = agent.requireServiceByType(WebDesignService);
```

| Method | Description |
|--------|-------------|
| `getDefaultWebDesignDirectory()` | Return the application default web design directory |
| `getWebDesignDirectory(agent)` | Return the active agent's web design directory |
| `listFlows(root)` | List flow summaries (`name`, `designCount`, `updatedAt`) |
| `createFlow(root, flowName)` | Create a new, empty flow; throws if the name is already in use |
| `deleteFlow(root, flowName)` | Delete a flow and all of its designs; returns `false` if it didn't exist |
| `listDesigns(root, flowName)` | List design summaries (`flowName`, `name`, `size`, `updatedAt`) within a flow |
| `getDesign(root, flowName, name)` | Read a design's content, or `null` if it doesn't exist |
| `createDesign(root, flowName, name, content)` | Create a new design, auto-creating its flow; throws if the name is already in use |
| `updateDesign(root, flowName, name, content)` | Create or overwrite a design, auto-creating its flow |
| `deleteDesign(root, flowName, name)` | Delete a design; returns `false` if it didn't exist |

## RPC

The plugin registers a `Web Design RPC` endpoint at `/rpc/web-design` with `listFlows`, `streamFlows`, `createFlow`,
`deleteFlow`, `listDesigns`, `streamDesigns`, `getDesign`, `createDesign`, `updateDesign`, and `deleteDesign`
methods, used by the Web Design app in the frontend.

## Related Packages

- `@tokenring-ai/media-library` - Shared storage for agent-generated images, video, and audio
- `@tokenring-ai/research` - Directory-backed deep research projects
