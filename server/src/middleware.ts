import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type Request, type Response, type NextFunction } from "express";

import type { McpServer } from "skybridge/server";

export const mcp = (server: McpServer) => async (req: Request, res: Response, next: NextFunction) => {
  // Only handle requests to the /mcp path
  if (req.path !== "/mcp") {
    return next();
  }

  const method = req.body?.method || "unknown";
  console.log(`\n[INFO][MCP-Transport] ========== ${method} ==========`);
  console.log(`[INFO][MCP-Transport] ${req.method} /mcp`);
  
  // Log full body for tools/list to see what schema is being returned
  if (method === "tools/list" || method === "initialize") {
    console.log(`[INFO][MCP-Transport] Body:`, JSON.stringify(req.body, null, 2));
  } else if (method === "tools/call") {
    console.log(`[INFO][MCP-Transport] Tool: ${req.body?.params?.name}`);
    console.log(`[INFO][MCP-Transport] Arguments:`, JSON.stringify(req.body?.params?.arguments, null, 2));
  } else {
    console.log(`[INFO][MCP-Transport] Body:`, JSON.stringify(req.body, null, 2));
  }

  if (req.method === "POST") {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        console.log(`[INFO][MCP-Transport] Connection closed`);
        transport.close();
      });

      console.log(`[INFO][MCP-Transport] Connecting server to transport...`);
      await server.connect(transport);
      console.log(`[INFO][MCP-Transport] Server connected, handling request...`);

      // Intercept response to log what's being sent back
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);
      let responseBody = "";
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.write = function(chunk: any, ...args: any[]) {
        if (chunk) {
          responseBody += typeof chunk === "string" ? chunk : String(chunk);
        }
        return originalWrite(chunk, ...args);
      } as typeof res.write;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.end = function(chunk?: any, ...args: any[]) {
        if (chunk) {
          responseBody += typeof chunk === "string" ? chunk : String(chunk);
        }
        // Log the response for debugging
        if (method === "tools/list") {
          console.log(`[INFO][MCP-Transport] RESPONSE for tools/list:`, responseBody.substring(0, 2000));
        } else if (method === "tools/call") {
          console.log(`[INFO][MCP-Transport] RESPONSE for tools/call:`, responseBody.substring(0, 1000));
        }
        return originalEnd(chunk, ...args);
      } as typeof res.end;

      await transport.handleRequest(req, res, req.body);
      console.log(`[INFO][MCP-Transport] Request handled successfully`);
    } catch (error) {
      console.error("[ERROR][MCP-Transport] Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  } else if (req.method === "GET" || req.method === "DELETE") {
    console.log(`[INFO][MCP-Transport] Rejecting ${req.method} request (not allowed)`);
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  } else {
    next();
  }
};
