/**
 * @experimental This feature is experimental and may change or be removed.
 *
 * Sessions Board - Visual session management with Kanban-style columns.
 */

// Sessions Board feature - barrel export
export { default as SessionsBoard } from "./components/SessionsBoard.svelte";
export { default as SessionCard } from "./components/SessionCard.svelte";
export { default as BoardColumn } from "./components/BoardColumn.svelte";
export * from "./types";
export * as sessionsBoardApi from "./api";
