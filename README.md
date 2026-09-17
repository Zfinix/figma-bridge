# figma-bridge

Full read/write access to the Figma desktop app over the Plugin API. An MCP
server plus a Figma plugin: the server speaks MCP over stdio to your agent, the
plugin runs inside Figma and executes what the server forwards.

## Pieces

- `server/index.ts` - stdio MCP server. Forwards tool calls to the relay.
- `server/relay.ts` - relay daemon on `ws://127.0.0.1:4395`. The plugin
  connects as `/plugin`, MCP server instances connect as `/server`. One relay,
  many agent sessions, one plugin connection.
- `server/smoke.ts` - smoke test: spawns the server, speaks MCP to it.
- `plugin/` - the Figma plugin. Connects out to the relay, executes Plugin API
  calls, reconnects with backoff.

## Tools

`execute` (arbitrary Plugin API code), `get_tree`, `get_node`, `get_screenshot`,
`notify`, `create_frame`, `create_text`, `set_properties`, `delete_node`,
`clone_node`, `set_fills`, `set_strokes`, `set_effects`, `import_component`,
`get_selection`, `set_selection`, `export_node`.

## Setup

1. Register the MCP server with your agent host:

   ```
   command: bun
   args: /path/to/figma-bridge/server/index.ts
   ```

2. In Figma desktop: Plugins > Development > Import plugin from manifest, pick
   `plugin/manifest.json`.

3. Open a file, run the figma-bridge plugin. It connects to the relay (the MCP
   server spawns the relay on first use if it is not running).

## Test

```
bun server/smoke.ts
```

## Plugin build

Sources are TypeScript in `plugin/src/`. Figma runs the compiled output in `plugin/dist/`.

    cd plugin
    bun install
    bun run build       # bundle code.ts and ui.ts to dist/
    bun run typecheck   # tsc against @figma/plugin-typings

Re-import `plugin/manifest.json` in Figma after changing paths (Plugins > Development > Import plugin from manifest).
