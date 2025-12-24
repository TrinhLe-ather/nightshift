CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`defaultBranch` text DEFAULT 'main',
	`executionMode` text DEFAULT 'auto',
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_path_unique` ON `repos` (`path`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL,
	`runId` text NOT NULL,
	`eventsPath` text,
	`startedAt` text NOT NULL,
	`completedAt` text,
	`storageKey` text,
	`eventCount` integer DEFAULT 0,
	FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_taskId` ON `sessions` (`taskId`);--> statement-breakpoint
CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`action` text NOT NULL,
	`createdAt` text NOT NULL,
	`syncedAt` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue_syncedAt` ON `sync_queue` (`syncedAt`);--> statement-breakpoint
CREATE INDEX `idx_sync_queue_entityType` ON `sync_queue` (`entityType`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`repoId` text,
	`repoPath` text,
	`priority` text DEFAULT 'medium',
	`status` text NOT NULL,
	`failureCode` text,
	`needsHumanCode` text,
	`needsHumanQuestion` text,
	`clarificationResponse` text,
	`githubIssueUrl` text,
	`branch` text,
	`prUrl` text,
	`createdAt` text NOT NULL,
	`claimedAt` text,
	`startedAt` text,
	`completedAt` text,
	`remoteId` text,
	`source` text DEFAULT 'local',
	`executionMode` text,
	`workDir` text,
	`baseCommitSha` text,
	`originalBranch` text,
	`pausedAt` text,
	`pauseReason` text,
	`humanQuestion` text,
	`humanResponse` text
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_repoId` ON `tasks` (`repoId`);--> statement-breakpoint
CREATE INDEX `idx_tasks_source` ON `tasks` (`source`);--> statement-breakpoint
CREATE INDEX `idx_tasks_createdAt` ON `tasks` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `tasks` (`priority`);