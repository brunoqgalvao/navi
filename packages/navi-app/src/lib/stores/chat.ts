/**
 * Chat Input Store
 *
 * Used to programmatically set the chat input value from other components.
 */
import { writable } from "svelte/store";

/**
 * Store for injecting text into the chat input.
 * Set this to a value and the ChatInput will pick it up and clear it.
 */
export const chatInputValue = writable<string>("");
