-- Add SDK session ID for Claude Agent SDK v2 resume capability
ALTER TABLE tasks ADD COLUMN sdkSessionId TEXT;
