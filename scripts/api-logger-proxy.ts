import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "http";
import { request as httpsRequest } from "https";
import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const PROXY_PORT = 8888;
const LOG_DIR = join(import.meta.dir, "../logs");
const LOG_FILE = join(LOG_DIR, `api-requests-${Date.now()}.jsonl`);

mkdirSync(LOG_DIR, { recursive: true });

console.log(`🔍 API Logger Proxy starting on port ${PROXY_PORT}`);
console.log(`📝 Logging to: ${LOG_FILE}`);
console.log(`\nTo use with Claude Code:\n`);
console.log(`  export HTTPS_PROXY=http://localhost:${PROXY_PORT}`);
console.log(`  export HTTP_PROXY=http://localhost:${PROXY_PORT}`);
console.log(`  export NODE_TLS_REJECT_UNAUTHORIZED=0`);
console.log(`  claude\n`);

function log(entry: object) {
  const line = JSON.stringify(entry, null, 2);
  console.log("\n" + "=".repeat(80));
  console.log(line);
  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

const server = createServer(async (clientReq: IncomingMessage, clientRes: ServerResponse) => {
  if (clientReq.method === "CONNECT") {
    const [host, port] = (clientReq.url || "").split(":");
    const targetPort = parseInt(port) || 443;

    console.log(`🔗 CONNECT tunnel to ${host}:${targetPort}`);

    const net = await import("net");
    const tls = await import("tls");

    const serverSocket = tls.connect(
      {
        host,
        port: targetPort,
        rejectUnauthorized: false,
      },
      () => {
        clientRes.writeHead(200, { Connection: "established" });
        (clientRes as any).flushHeaders?.();

        const clientSocket = (clientReq as any).socket;

        const tlsServer = new tls.TLSSocket(clientSocket, {
          isServer: true,
          key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7cn08eLb0P+Jx
LX7k4M7hnJnD7u3tHLpwvE5pRzKZBsI1CRLHcdGmTVPXcz3MZvS/fYqgGQ3K0xnE
PjJvNZEXHlVVrCzLJz8iqhKJqgLYQNBqCtyGqwqQLI3qE5+gG7DP8p8VLPK5CERF
3FvfVPhvMJMkqPy7vr7M3nKT8f0w8LLiIxhXyxPqr5MvAGmPmLqKQx+JAEZl0FTL
xPhQ8hhRvTlXqEkzKLxLCpX5m8ZyXQiKqj1cG0OqMj8PKy0RiXZlFhy2fPz0FxjP
xOqKPsQZ0LcLpzPLfvEYKsU2JqKE1QqQfYMNfRPJpTi8vLKn2OqBfNKXvPGPxNQY
3b2rEP0bAgMBAAECggEABLyHmIKuSjYT7gVz7yLxPyFfvEl9aRqnCpGIqq8yEIsy
K1zhDigXZ+cKfNSpmfqKqKxL8NgUBOqfvPsHbJHp0Jg0C4e5hvOFQFz8Qi7SCXZF
oqs7K1xLPg8mE8bhvPhnF2/XuDAufKH/sDgfEBY0KkqjP/ZJcPQM1b8L7X1VZwYf
c/X1kGhQr6mHhOyICPlHvEP9OcKQ3bFgVpKr9C/nE9yBvPjP8Dz7l9JvMZUhVdQ9
tMDFPp0MUybIJiLz8qh7MK6qkqqFPqOZcBaLMfMhphYbJlFfwA0mZwwP+VPfvBsN
f1Lf/qAaFgGsQGOmk1RhM1FhU7fGZE7j6qYy8cDlgQKBgQDmGXEC5lEIxfkz9PxF
pOKdHkKF+0fb0FPpPYGAs9k9X1h6LJYLgIw5v0H6VTnLh3trZdYwSkGL3BvTrWPD
R6qpDLdy0fP9FxoLCAg+JEqYqZsW1EfvPfP6vjmUQP0lKmKjVdMMOlp1sTOq3UEx
1BxPmJIoNgW1QkYgE4A1OQGL+wKBgQDSR6BB4S8LPb9JvYhz9ET91wkRPvSk8faL
nBnePDI0r/cywqYagrQeqpfP1LDnKh4Pb8acHihLp1k2qqKQfPH3U+5fOxyz9oyT
P1RoAsHFv1bPJqHhxzv+FMq/xu7SBrbNFpPBfQkE7T/PH3jPfE7Oh4yDBfOLxWjh
GEbwUPTkgQKBgQCi4psNdmHWl0WwkE5i+AhzctCHbfqv+HlaPy4X6gQkLqpNpbCJ
fPKIHFwASdDRuCz3qnws+vLzS74JOoX8OLBfMsfGqYFimd2fqCpPfxhsNxOBlFcl
V4PzP2QKGcAKKSj4PJPvkONBPvMl5dI/+xZYoUKnOQ01ZD2lNfETqCqjJwKBgCu8
QnPSgPvFc8fCiKfDwjPVfDLcG7PPXQ1LsS1EKy2A1M67e2b3vUFfjqEjamVMqKio
T+CYS5Qfbt+8BBQL6TAZbBgnjnoYJ0aE2VfOLqWfVqI7M+E1MYJj0Wzg8yKLGbZx
1NlnWNKPQ/nGChHPfAhfaE8Aqd1kPtU9h1qTwlABAoGBAMFfF2Cq5YE7bIRm1Aer
KXKWfCPQD1dzify0qvzfqrLfQpE5f3X2aP2dP3cYsqIS8l7G3GKMD3OVD0dCawsD
7AZDPqLv0fQ7g4JDKy3pl5xus3LsnNBkERaC5i1S4prfVwBR9XE5QXlnLan0YCfL
VpC3VoVE8LKi8BVQI8zzKsYW
-----END PRIVATE KEY-----`,
          cert: `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUQHKJGhPrfDgNQAdKKhSuCT5a3CIwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDAxMDEwMDAwMDBaFw0yNTEy
MzEyMzU5NTlaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC7cn08eLb0P+JxLX7k4M7hnJnD7u3tHLpwvE5pRzKZ
BsI1CRLHcdGmTVPXcz3MZvS/fYqgGQ3K0xnEPjJvNZEXHlVVrCzLJz8iqhKJqgLY
QNBqCtyGqwqQLI3qE5+gG7DP8p8VLPK5CERF3FvfVPhvMJMkqPy7vr7M3nKT8f0w
8LLiIxhXyxPqr5MvAGmPmLqKQx+JAEZl0FTLxPhQ8hhRvTlXqEkzKLxLCpX5m8Zy
XQiKqj1cG0OqMj8PKy0RiXZlFhy2fPz0FxjPxOqKPsQZ0LcLpzPLfvEYKsU2JqKE
1QqQfYMNfRPJpTi8vLKn2OqBfNKXvPGPxNQY3b2rEP0bAgMBAAGjUzBRMB0GA1Ud
DgQWBBTd7q9XpTfvpjC9KqH1qHVJ7jhvYzAfBgNVHSMEGDAWgBTd7q9XpTfvpjC9
KqH1qHVJ7jhvYzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBJ
H9wHy7PkaQ8OXJqo3bnBvXL5pX0rQgUHgfEPmn3BEZR7Jv7I3xHqP7m5WxW+8ghL
LPPV7cSqJNqBETP3GRFG9S1LdRH5Mz8CT3xGE5Q3KsLTVcOor1BLxsTGcS3FPMKh
l8iqhQBFwl8qSqLT4qEHqL2BXPRP/m4N0gN4sQIZpGFX3q89XH2DV0sT1tan1qUx
QytQv4dpL8iHG1X5bYFqFz/dWrHVqQV2YHph/r6M1FSm8bB4xLSE+ij3be0xbidQ
S1fmsL2JwlOVwJnpMfxD/XZ0vAtz1bDeQyIy5YXLS5lsT/5VwpF4AohJr0bGkJz3
fBoZ2KzlIYuHIFJ4n8W6
-----END CERTIFICATE-----`,
        });

        tlsServer.on("data", (data: Buffer) => {
          const dataStr = data.toString();

          if (dataStr.startsWith("POST") || dataStr.startsWith("GET")) {
            const lines = dataStr.split("\r\n");
            const [method, path] = lines[0].split(" ");
            const headerEndIndex = dataStr.indexOf("\r\n\r\n");
            const body = headerEndIndex > -1 ? dataStr.slice(headerEndIndex + 4) : "";

            let parsedBody: any = body;
            try {
              if (body.trim()) {
                parsedBody = JSON.parse(body);
              }
            } catch {}

            const entry = {
              timestamp: new Date().toISOString(),
              host,
              method,
              path,
              body: parsedBody,
            };

            if (host.includes("anthropic") || host.includes("claude")) {
              log(entry);
            }
          }

          serverSocket.write(data);
        });

        serverSocket.on("data", (data: Buffer) => {
          tlsServer.write(data);
        });

        serverSocket.on("error", (err) => console.error("Server socket error:", err.message));
        tlsServer.on("error", (err) => console.error("TLS socket error:", err.message));
        serverSocket.on("end", () => tlsServer.end());
        tlsServer.on("end", () => serverSocket.end());
      }
    );

    serverSocket.on("error", (err) => {
      console.error(`Connection error to ${host}:${targetPort}:`, err.message);
      clientRes.writeHead(502);
      clientRes.end();
    });

    return;
  }

  console.log(`📨 ${clientReq.method} ${clientReq.url}`);
});

server.listen(PROXY_PORT, () => {
  console.log(`\n✅ Proxy listening on port ${PROXY_PORT}\n`);
});
