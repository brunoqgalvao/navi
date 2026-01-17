/**
 * Integration Providers
 *
 * Import this module to register all integrations.
 * Each provider file calls defineIntegration() which auto-registers.
 *
 * To add a new integration:
 * 1. Create providers/{name}.ts with defineIntegration()
 * 2. Export it here
 * 3. Done! The query worker auto-loads connected integrations.
 */

// Import providers to register them
export { googleIntegration } from "./google";
export { slackIntegration } from "./slack";

// Re-export the registry functions
export {
  getIntegrations,
  getIntegration,
  getConnectedIntegrations,
  getIntegrationMcpServers,
  getIntegrationOAuthConfigs,
  defineIntegration,
  defineTool,
} from "../define";
