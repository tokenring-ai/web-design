# @tokenring-ai/web-design

Browser-ready web design flows backed by files on disk.

## Overview

The `@tokenring-ai/web-design` package provides a simple two-level file store for browser-ready mockups:

- A **Flow** is a named collection of related pages and assets (e.g. an onboarding flow or checkout flow).
- A flow may contain HTML, CSS, JavaScript, images, fonts, and other browser assets.

Files in a flow are hosted via the workspace filesystem HTTP endpoint at `/api/fs/posix/<webDesignDirectory>/<flow>/<file>`, so pages can link sibling files with ordinary relative URLs. Text files can be viewed and edited directly in the Web Design app; arbitrary files can be uploaded as flow assets. Previews load in a sandboxed iframe in the Web Design app.

## Key Features

- **Multi-file Flows**: HTML, CSS, JavaScript, images, fonts, and other files are stored as `<webDesignDirectory>/<flow>/<file>`
- **Hosted Previews**: Flow files are served via the workspace filesystem HTTP endpoint so pages and assets are hosted together under one URL prefix
- **Configurable Directory**: One workspace-relative root directory for all design flows
- **CRUD via RPC**: List, create, retrieve, update, and delete flows and designs from the frontend
- **CRUD via Tools**: Agents can list, read, write, and delete flows and designs while doing frontend work
- **Live List Updates**: `streamFlows` / `streamDesigns` poll the directory so the frontend list stays current
- **Auto-vivified Flows**: Writing a design to a flow that doesn't exist yet creates the flow automatically
- **Web Design Agent**: Ships a `web-design` agent type and `/design` command for UI mockup work
- **Selected Design Attachments**: A lifecycle hook automatically attaches the selected design to new chat messages

## Installation

```bash
bun add @tokenring-ai/web-design
```

## Chat Commands

| Command    | Description                                    |
|------------|------------------------------------------------|
| `/design`  | Design HTML UI mockups organized into flows    |

The `/design` command starts a web design run that writes HTML mockups into design flows. The agent will:

- Create or reuse a flow under the web design directory
- Plan screens and states with todos
- Write linked HTML/CSS/JS files via `design_write`
- Iterate until the flow is complete

When run on a web-design agent, work continues in the foreground on that agent. When run from another
agent type, a background web-design agent is started.

## Tools

The package registers seven tools with the `ChatService`:

| Tool            | Display Name                 | Description                                      |
|-----------------|------------------------------|--------------------------------------------------|
| `flow_list`     | `Web Design/list flows`      | List the design flows (collections of related designs) in the web design directory |
| `flow_create`   | `Web Design/create flow`     | Create a new, empty design flow (a named collection of related designs) |
| `flow_delete`   | `Web Design/delete flow`     | Delete a design flow and all of the designs it contains |
| `design_list`   | `Web Design/list designs`    | List the HTML, CSS, JavaScript, and asset files within a design flow |
| `design_read`   | `Web Design/read design`     | Read a text file or base64-encoded binary asset within a design flow |
| `design_write`  | `Web Design/write design`    | Create or overwrite a text file within a design flow. Files in the same flow are hosted together, so HTML can link to sibling CSS and JavaScript files with relative URLs. The flow is created automatically if it doesn't already exist. |
| `design_delete` | `Web Design/delete design`   | Delete a file from a design flow |

### Tool Input Parameters

#### `flow_list`

No input parameters.

#### `flow_create`

| Parameter | Type     | Description             |
|-----------|----------|-------------------------|
| `name`    | `string` | Name of the flow to create |

#### `flow_delete`

| Parameter | Type     | Description             |
|-----------|----------|-------------------------|
| `name`    | `string` | Name of the flow to delete |

#### `design_list`

| Parameter  | Type     | Description                              |
|------------|----------|------------------------------------------|
| `flowName` | `string` | Name of the flow to list designs from    |

#### `design_read`

| Parameter  | Type     | Description                                                                    |
|------------|----------|--------------------------------------------------------------------------------|
| `flowName` | `string` | Name of the flow the design belongs to                                         |
| `name`     | `string` | File name to read, including its extension (for example index.html or styles.css) |

#### `design_write`

| Parameter  | Type     | Description                                                                                            |
|------------|----------|--------------------------------------------------------------------------------------------------------|
| `flowName` | `string` | Name of the flow this design belongs to; created automatically if it doesn't exist                     |
| `name`     | `string` | File name to create or update, including its extension (for example index.html, styles.css, or app.js) |
| `content`  | `string` | Full text content, or base64 data when encoding is base64                                              |
| `encoding` | `string` | How content is encoded (`"utf8"` or `"base64"`, default `"utf8"`)                                      |

The tool writes through `updateDesign` (create or overwrite). Its result returns the saved file metadata
(`flowName`, `name`, `size`, `updatedAt`) but not the `content` field.

#### `design_delete`

| Parameter  | Type     | Description                              |
|------------|----------|------------------------------------------|
| `flowName` | `string` | Name of the flow the design belongs to   |
| `name`     | `string` | File name to delete, including its extension |

### Config-Defined Tool

The package also provides a config-defined tool (registered via agent config, not exported from `tools.ts`):

| Tool         | Display Name          | Description                                                                   |
|--------------|-----------------------|-------------------------------------------------------------------------------|
| `ui-expert`  | `Web Design/UI Expert`| Use this tool to implement frontend UI components. It has specialized knowledge about the users front-end design preferences, and can more effectively implement design systems, generate style guides, and build user-centered interfaces. |

This tool accepts the following input arguments: `task_summary`, `instructions`, `relevant_surface_area`,
`ui_ux_requirements`, `constraints`, `known_issues_and_risks`, `non_goals`, and `completion_criteria`. It
is available to agents of the `web-design` agent type.

## Configuration

Configure the web design plugin in your application config:

```yaml
webDesign:
  webDesignDirectory: ./.tokenring/web-design
  agentTypes:
    - web-design
```

### Configuration Options

| Field                 | Type       | Required | Default          | Description                                    |
|-----------------------|------------|----------|------------------|------------------------------------------------|
| `webDesignDirectory`  | `string`   | No       | `"web-design"`   | Directory where design flows are stored        |
| `agentTypes`          | `string[]` | No       | `["web-design"]` | The available agent types that can be used for web design |

The `webDesignDirectory` path is resolved relative to the application workspace directory.

### Schema Metadata

The `WebDesignServiceConfigSchema` includes `.meta()` annotations for configuration UI integration:

- **Top-level**: label `"Web Design"`, description `"Figma-style design flows and designs, backed by files on disk"`
- **`webDesignDirectory`**: description `"Directory where design flows are stored"`
- **`agentTypes`**: description `"The available agent types that can be used for web design"`

### Agent Types

The plugin ships a `web-design` agent type via `config/agents/web-design.yaml`:

| Field          | Value                                                                                 |
|----------------|---------------------------------------------------------------------------------------|
| Agent type     | `web-design`                                                                          |
| Display name   | `Web Design Agent`                                                                    |
| Category       | `Web Design Plugin`                                                                   |
| Description    | Design UI mockups and multi-screen flows as linked HTML, CSS, JavaScript, and asset files. Provide product goals, user journeys, or existing screens. The agent creates browser-ready mockups organized into flows (e.g. onboarding, checkout) that appear live in the Web Design app. |
| Enabled tools  | `flow_*`, `design_*`, `todo`, `file_*`                                                |
| Enabled hooks  | `addSelectedDesign`                                                                   |

It drives the `/design` chat command and is returned by `getAgentTypes()` from the configured
`agentTypes` field.

## Naming

Flow names must start with a letter or number and may contain letters, numbers, hyphens, and underscores
(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`). File names may additionally contain dots and must start with a letter or
number (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`); `.` and `..` are rejected. For backward compatibility, a file
name without an extension is stored with `.html`. Binary files are written with `encoding: "base64"` and
read back base64-encoded; text files are stored and read as UTF-8.

## Core Components

### WebDesignService

The central service that manages flows and designs on disk.

```typescript
import { WebDesignService } from "@tokenring-ai/web-design";

const webDesignService = agent.requireService(WebDesignService);
```

**Properties:**

| Property      | Type     | Description                                                      |
|---------------|----------|------------------------------------------------------------------|
| `name`        | `string` | `"WebDesignService"`                                             |
| `description` | `string` | `"Figma-style design flows and designs, backed by files on disk"`|

**Methods:**

| Method | Description |
|--------|-------------|
| `getAgentTypes()` | Return the agent types configured for web design (from `WebDesignServiceConfigSchema.agentTypes`) |
| `getWebDesignDirectoryName()` | Return the configured directory name relative to the workspace (e.g. `web-design`) |
| `getWebDesignDirectory()` | Return the workspace-resolved absolute path of the web design directory |
| `getCurrentDesign(agent)` | Return the agent's currently selected design, or `undefined` |
| `selectDesign(flowName, designName, agent)` | Load a design and set it as the agent's current selection; returns the design or `null` |
| `clearCurrentDesign(agent)` | Clear the agent's currently selected design |
| `listFlows()` | List flow summaries (`name`, `designCount`, `updatedAt`), sorted by name |
| `createFlow(flowName)` | Create a new, empty flow; throws if the name is already in use |
| `deleteFlow(flowName)` | Delete a flow and all of its designs; returns `false` if it didn't exist |
| `listDesigns(flowName)` | List design summaries (`flowName`, `name`, `size`, `mimeType`, `updatedAt`) within a flow, sorted by name |
| `getDesign(flowName, designName)` | Read a design's content, or `null` if it doesn't exist; text files are returned UTF-8, binary files base64 |
| `createDesign(flowName, designName, content, encoding?)` | Create a new design, auto-creating its flow; throws if the name is already in use |
| `updateDesign(flowName, designName, content, encoding?)` | Create or overwrite a design, auto-creating its flow |
| `deleteDesign(flowName, designName)` | Delete a design; returns `false` if it didn't exist |

`encoding` defaults to `"utf8"` on `createDesign` / `updateDesign`.

### WebDesignState

Agents maintain a `WebDesignState` instance that holds the currently selected design.

```typescript
import { WebDesignState } from "@tokenring-ai/web-design";

const state = agent.getState(WebDesignState);
```

| Property                 | Type                          | Description                                                          |
|--------------------------|-------------------------------|----------------------------------------------------------------------|
| `currentDesign`          | `Design \| undefined`         | The currently selected design                                        |
| `lastAttachedDesignId`   | `string \| undefined`         | ID of the last design attached to chat (prevents duplicate attachments) |

#### State Inheritance

`WebDesignState` implements `transferStateFromParent`. When a child agent is created, it inherits the
parent's `currentDesign` if the child does not already have one.

#### State Serialization

- `serialize()` — Returns `{ currentDesign?, lastAttachedDesignId? }`
- `deserialize(data)` — Restores all properties from serialized data
- `show()` — Returns a human-readable summary string
  (`Current Design: <flowName>/<designName>` and `Last Attached Design ID: <id>`, or `None`)

## Services

`WebDesignService` implements the `TokenRingService` interface and is registered by the plugin during
`install`:

```typescript
app.addService(new WebDesignService(app));
```

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `attach(agent)` | Initialize `WebDesignState` on the agent (`agent.initializeState(WebDesignState, {})`) |
| `reconfigure(options)` | Replace the service configuration at runtime |

## Lifecycle Hooks

The package registers one lifecycle hook via `AgentLifecycleService`.

### addSelectedDesign

- **Name**: `addSelectedDesign`
- **Display Name**: `Web Design/Add currently selected design to chat`
- **Description**: Attaches the currently selected design file to the chat message
- **Triggered by**: `BeforeInputReceived`

When a user sends a new message, this hook checks the agent's `WebDesignState.currentDesign`. If a design
is selected and has not already been attached (tracked via `lastAttachedDesignId`), it appends an
attachment to the message:

```typescript
{
  name: "<flowName>/<designName>",
  description: "This is the currently selected file from the web design flow.",
  encoding: currentDesign.encoding === "utf8" ? "text" : "base64",
  mimeType, // supported attachment mime types; text falls back to "text/plain",
            // unsupported binary mime types are skipped
  body: currentDesign.content,
}
```

The attachment ID is `<flowName>/<designName>`; each design is attached at most once per agent. The hook
is enabled for the `web-design` agent type out of the box and can be toggled per agent through
`AgentLifecycleService` (`enableHooks` / `disableHooks` / `setEnabledHooks` with the hook name
`"addSelectedDesign"`).

## RPC

The plugin registers a `Web Design RPC` endpoint at `/rpc/web-design`:

| Method                       | Type      | Description                                                                 |
|------------------------------|-----------|-----------------------------------------------------------------------------|
| `getWebDesignConfiguration`  | query     | Get web design configuration (`agentTypes`)                                 |
| `listFlows`                  | query     | List all flows                                                              |
| `streamFlows`                | stream    | Polling stream of flows (3s interval)                                       |
| `createFlow`                 | mutation  | Create a new flow                                                           |
| `deleteFlow`                 | mutation  | Delete a flow and its designs                                               |
| `listDesigns`                | query     | List designs within a flow                                                  |
| `streamDesigns`              | stream    | Polling stream of designs (3s interval)                                     |
| `getDesign`                  | query     | Read a design's content                                                     |
| `createDesign`               | mutation  | Create a new design (`content` defaults to `""`)                            |
| `updateDesign`               | mutation  | Create or overwrite a design                                                |
| `deleteDesign`               | mutation  | Delete a design                                                            |
| `getWebDesignState`          | query     | Get an agent's currently selected flow and design                          |
| `updateWebDesignState`       | mutation  | Set an agent's currently selected flow and design                          |

`getWebDesignConfiguration` returns `{ agentTypes: string[] }` from the configured `agentTypes` field
(default `["web-design"]`). The `createDesign` input's `content` defaults to an empty string and both
write methods default `encoding` to `"utf8"`.

### State Management Methods

`getWebDesignState` and `updateWebDesignState` return a discriminated union on `status`:

| Status            | Additional Fields                                                           | Description                                    |
|-------------------|-----------------------------------------------------------------------------|------------------------------------------------|
| `"success"`       | `selectedFlowName: string \| null`, `selectedDesignName: string \| null`    | Agent found and state returned                 |
| `"agentNotFound"` | _(none)_                                                                    | The specified `agentId` does not match an active agent |

`updateWebDesignState` selects a design only when both `selectedFlowName` and `selectedDesignName` are
provided; otherwise it returns the current selection unchanged.

### Streaming Methods

`streamFlows` and `streamDesigns` are polling streams built with `createPollingQueryStream` that re-query
the directory every 3 seconds, yielding updated flow or design lists.

## Dependencies

| Package                   | Purpose                                                    |
|---------------------------|------------------------------------------------------------|
| `@tokenring-ai/agent`     | Agent state management and lifecycle hook types            |
| `@tokenring-ai/app`       | Plugin and service interfaces, `TokenRingApp`, config metadata |
| `@tokenring-ai/chat`      | Tool registration with `ChatService`                       |
| `@tokenring-ai/lifecycle` | Lifecycle hook registration                                |
| `@tokenring-ai/rpc`       | RPC endpoint and polling stream utilities                  |
| `@tokenring-ai/utility`   | Deep clone utility for config merging                      |
| `zod`                     | Schema validation                                          |

## Testing

Tests use `bun test` and are located in `WebDesignService.test.ts`:

```bash
bun test
```

The test suite covers flow and design CRUD, flow auto-creation on write, duplicate detection, binary and
text assets, name validation (including path traversal rejection), and directory listing behavior.

## License

MIT License — see LICENSE file for details.
