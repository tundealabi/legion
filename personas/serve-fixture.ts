import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

export type FixtureServer = {
  readonly url: string;
  close(): Promise<void>;
};

export async function serveIssueTrackerFixture(): Promise<FixtureServer> {
  const fixturePath = fileURLToPath(
    new URL("../../personas/issue-tracker/fixture.html", import.meta.url),
  );
  const html = await readFile(fixturePath, "utf8");

  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture server did not bind a TCP port");
  }

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
