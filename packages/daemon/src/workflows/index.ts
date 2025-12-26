/**
 * Workflows Module - Barrel Export
 *
 * Exports workflow loader functionality
 */

export {
  loadBuiltinWorkflows,
  getWorkflow,
  getWorkflowRecord,
  listWorkflows,
  initWorkflows,
  createSmartCommitStep,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowSummary,
} from "./loader.js";
