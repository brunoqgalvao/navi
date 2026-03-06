import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("workspace folder nesting", () => {
  let handleFolderRoutes: typeof import("./folders").handleFolderRoutes;
  let dbModule: typeof import("../db");
  const projectPath = mkdtempSync(join(tmpdir(), "navi-folder-nesting-"));
  const createdFolderIds: string[] = [];
  let projectId: string | null = null;

  beforeAll(async () => {
    dbModule = await import("../db");
    await dbModule.initDb();
    ({ handleFolderRoutes } = await import("./folders"));
  });

  afterAll(() => {
    if (projectId) {
      try {
        dbModule.projects.delete(projectId);
      } catch {}
    }

    for (const folderId of [...createdFolderIds].reverse()) {
      try {
        if (dbModule.workspaceFolders.get(folderId)) {
          dbModule.workspaceFolders.delete(folderId);
        }
      } catch {}
    }

    rmSync(projectPath, { recursive: true, force: true });

    try {
      dbModule.saveDb();
    } catch {}
  });

  async function createFolder(name: string, parentId: string | null = null) {
    const req = new Request("http://localhost/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });

    const response = await handleFolderRoutes(new URL(req.url), "POST", req);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(201);

    const folder = await response!.json() as { id: string; parent_id: string | null; name: string };
    createdFolderIds.push(folder.id);
    return folder;
  }

  test("supports nested folders, rejects cycles, and bubbles children on delete", async () => {
    const root = await createFolder("Root");
    const child = await createFolder("Child", root.id);
    const grandchild = await createFolder("Grandchild", child.id);

    expect(child.parent_id).toBe(root.id);
    expect(grandchild.parent_id).toBe(child.id);

    const invalidMoveReq = new Request(`http://localhost/api/folders/${child.id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: grandchild.id }),
    });

    const invalidMoveResponse = await handleFolderRoutes(
      new URL(invalidMoveReq.url),
      "POST",
      invalidMoveReq
    );

    expect(invalidMoveResponse).not.toBeNull();
    expect(invalidMoveResponse!.status).toBe(400);
    const invalidMovePayload = await invalidMoveResponse!.json() as { error: string };
    expect(invalidMovePayload.error).toContain("descendant");

    projectId = crypto.randomUUID();
    const now = Date.now();
    dbModule.projects.create(projectId, "Nested Folder Test Project", projectPath, null, now, now);
    dbModule.projects.setFolder(projectId, child.id);

    const deleteReq = new Request(`http://localhost/api/folders/${child.id}`, {
      method: "DELETE",
    });

    const deleteResponse = await handleFolderRoutes(new URL(deleteReq.url), "DELETE", deleteReq);
    expect(deleteResponse).not.toBeNull();
    expect(deleteResponse!.status).toBe(200);

    const bubbledGrandchild = dbModule.workspaceFolders.get(grandchild.id);
    expect(bubbledGrandchild?.parent_id).toBe(root.id);

    const bubbledProject = dbModule.projects.get(projectId);
    expect(bubbledProject?.folder_id).toBe(root.id);
  });
});
