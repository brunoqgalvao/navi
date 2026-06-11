import { describe, expect, test } from "bun:test";

import { getAllDescendants, indexProcessesByParent } from "./processes";

describe("process tree helpers", () => {
  test("indexes descendants from a single process snapshot", () => {
    const processes = [
      { pid: 2, ppid: 1, command: "worker" },
      { pid: 3, ppid: 2, command: "shell" },
      { pid: 4, ppid: 3, command: "task" },
      { pid: 5, ppid: 2, command: "preview" },
    ];

    const descendants = getAllDescendants(2, indexProcessesByParent(processes));

    expect(descendants.map((proc) => proc.pid)).toEqual([3, 4, 5]);
  });

  test("skips already visited processes to avoid cycles", () => {
    const processes = [
      { pid: 8, ppid: 9, command: "cycle-a" },
      { pid: 9, ppid: 8, command: "cycle-b" },
    ];

    const descendants = getAllDescendants(8, indexProcessesByParent(processes));

    expect(descendants.map((proc) => proc.pid)).toEqual([9]);
  });
});
