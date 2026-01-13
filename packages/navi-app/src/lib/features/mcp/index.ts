/**
 * MCP Feature Module
 * Manages MCP (Model Context Protocol) server settings
 */

export { mcpApi, type McpServer, type CreateMcpServerRequest, type MCPServerPreset, type MCPSetupStep, type AddPresetRequest } from "./api";
export { default as McpSettings } from "./components/McpSettings.svelte";
export { default as McpSetupWizard, type WizardResult } from "./components/McpSetupWizard.svelte";
