import { beforeAll, describe, expect, test } from "bun:test";

import {
  describeChildStatus,
  seedSpawnedChildrenFromDb,
  type PendingDeliverable,
  type SpawnedChildInfo,
} from "./spawned-children";

describe("describeChildStatus", () => {
  test("reports a delivered child as completed", () => {
    expect(describeChildStatus("delivered")).toContain("Completed");
  });

  test("distinguishes a blocked child from a working one", () => {
    expect(describeChildStatus("blocked")).not.toBe(describeChildStatus("working"));
    expect(describeChildStatus("blocked")).toContain("Blocked");
  });

  test("falls back to working for an unknown or missing status", () => {
    expect(describeChildStatus(undefined)).toContain("Working");
    expect(describeChildStatus("something-new")).toContain("Working");
  });
});

describe("seedSpawnedChildrenFromDb", () => {
  let dbModule: typeof import("../db");
  const unique = `spawn-seed-${Date.now().toString(36)}`;
  const projectId = `proj-${unique}`;
  const parentId = `parent-${unique}`;

  beforeAll(async () => {
    dbModule = await import("../db");
    await dbModule.initDb();
    const now = Date.now();
    dbModule.projects.create(projectId, "Spawn Seed Test", `/tmp/${unique}`, null, now, now);
    dbModule.sessions.create(parentId, projectId, "Parent", now, now, "claude");
  });

  function spawnChild(suffix: string, role: string, task: string) {
    const child = dbModule.sessionHierarchy.spawnChild(parentId, {
      id: `child-${unique}-${suffix}`,
      title: role,
      role,
      task,
    });
    if (!child) throw new Error("spawnChild returned null");
    return child;
  }

  test("restores children spawned in an earlier turn", async () => {
    const child = spawnChild("a", "researcher", "Read the docs");

    const children = new Map<string, SpawnedChildInfo>();
    const deliverables: PendingDeliverable[] = [];
    await seedSpawnedChildrenFromDb(parentId, children, deliverables);

    // Before this, a fresh worker reported "you haven't spawned any child agents".
    expect(children.size).toBeGreaterThan(0);
    expect(children.get(child.id)?.role).toBe("researcher");
    expect(children.get(child.id)?.task).toBe("Read the docs");
  });

  test("recovers a deliverable that landed after the parent's turn ended", async () => {
    const child = spawnChild("b", "builder", "Write the adapter");
    dbModule.sessionHierarchy.setDeliverable(child.id, {
      type: "code",
      summary: "Adapter written",
      content: "Full report body",
      artifacts: [{ path: "adapter.ts", description: "the adapter" }],
    } as any);

    const children = new Map<string, SpawnedChildInfo>();
    const deliverables: PendingDeliverable[] = [];
    await seedSpawnedChildrenFromDb(parentId, children, deliverables);

    const recovered = deliverables.find((d) => d.childSessionId === child.id);
    expect(recovered).toBeDefined();
    expect(recovered?.deliverable.summary).toBe("Adapter written");
    expect(recovered?.deliverable.content).toBe("Full report body");
    expect(children.get(child.id)?.status).toBe("delivered");
  });

  test("does not duplicate what the current turn already knows", async () => {
    const child = spawnChild("c", "reviewer", "Review it");
    dbModule.sessionHierarchy.setDeliverable(child.id, {
      type: "review",
      summary: "Looks fine",
      content: "No blocking issues",
    } as any);

    const children = new Map<string, SpawnedChildInfo>();
    const deliverables: PendingDeliverable[] = [];
    await seedSpawnedChildrenFromDb(parentId, children, deliverables);
    await seedSpawnedChildrenFromDb(parentId, children, deliverables);

    expect(deliverables.filter((d) => d.childSessionId === child.id)).toHaveLength(1);
  });

  test("is a no-op without a parent session id", async () => {
    const children = new Map<string, SpawnedChildInfo>();
    const deliverables: PendingDeliverable[] = [];

    await seedSpawnedChildrenFromDb(undefined, children, deliverables);

    expect(children.size).toBe(0);
    expect(deliverables).toHaveLength(0);
  });
});
