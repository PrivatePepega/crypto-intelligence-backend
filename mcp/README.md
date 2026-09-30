# MCP server

An MCP (Model Context Protocol) server that runs **inside the Express process**.
There is no second Node process and no second port: the endpoint is mounted on
the same app and port as the REST API, at `/mcp`.

`mountMcpServer(app)` is called in `index.ts` after `express.json()` and before
`app.listen()`, so provider configuration is resolved (and reported) at boot.

## Layout

| Path                    | Role                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `mcp/index.ts`          | Public entry. Mounts the endpoint, applies the security guards, logs which providers are live. |
| `mcp/server.ts`         | Generic server factory. Resolves providers once per process.  |
| `mcp/registry.ts`       | **The list of providers. This is the file you edit to add one.** |
| `mcp/types.ts`          | `McpToolModule` / `McpToolSet` — the provider contract.       |
| `mcp/modules/*.ts`      | One file per provider.                                        |

## Adding a provider

1. Write `mcp/modules/<name>.ts`:

   ```ts
   import type { McpToolModule } from "../types.js";

   export const myProviderModule: McpToolModule = {
     namespace: "myprovider",
     create() {
       const apiKey = process.env.MY_PROVIDER_API_KEY;

       // Return null to stay disabled rather than failing startup.
       if (!apiKey) return null;

       return {
         register(server) {
           server.registerTool(
             "myprovider_do_thing",
             { description: "...", inputSchema: mySchema },
             async (args) => { /* ... */ },
           );
         },
       };
     },
   };
   ```

2. Append it to the array in `mcp/registry.ts`.

That is the whole change. Namespace every tool with the module's `namespace`
so names cannot collide across providers.

## Environment

| Variable              | Required | Purpose                                                                 |
| --------------------- | -------- | ----------------------------------------------------------------------- |
| `MCP_PATH`            | no       | Mount path. Default `/mcp`.                                              |
| `MCP_API_KEY`         | **yes in production** | Shared secret. Clients send `Authorization: Bearer <key>`. When unset the endpoint runs unauthenticated and logs a warning at boot. |
| `MCP_ALLOWED_HOSTS`   | yes in production | Comma-separated hostnames allowed in the `Host` header, for DNS-rebinding protection. localhost is always allowed. A deployed host missing from this list gets **403 on every request**. |
| `MCP_ALLOWED_ORIGINS` | no       | Comma-separated origin hostnames. Requests with no `Origin` (every non-browser MCP client) always pass. |
| `MARKETAUX_API_KEY`   | for Marketaux | Without it the provider is disabled and absent from `tools/list`. |

## Notes

- The SDK performs **no token verification of its own**; the `MCP_API_KEY` gate
  is this repo's own middleware, not part of the SDK.
- Responses are `text/event-stream` when the client advertises it, which the
  Streamable HTTP spec requires. A client must accept both `application/json`
  and `text/event-stream` or it gets 406.
- `createMcpServer()` is called per HTTP request, as the SDK expects. Provider
  setup is memoised in `mcp/server.ts` so API clients are built once.

## Tests

```
npx tsx tests/mcp.server.contract.test.ts   # provider contract, over JSON-RPC
npx tsx tests/mcp.http.test.ts              # Express mount, guards, over HTTP
```
