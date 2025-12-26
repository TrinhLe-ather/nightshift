CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text NOT NULL,
	`checkpointId` text,
	`toolCalls` text,
	FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_taskId` ON `messages` (`taskId`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_messages_checkpointId` ON `messages` (`checkpointId`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflowId` text NOT NULL,
	`taskId` text NOT NULL,
	`stepResults` text,
	`completedSteps` integer DEFAULT 0,
	FOREIGN KEY (`workflowId`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_taskId` ON `workflow_runs` (`taskId`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflowId` ON `workflow_runs` (`workflowId`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`definition` text NOT NULL,
	`isBuiltin` integer DEFAULT false,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `transcriptPath` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `messageCount` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `name` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `sdkSessionId` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `type` text DEFAULT 'interactive';--> statement-breakpoint
ALTER TABLE `tasks` ADD `messageCount` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `workflowId` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `currentStep` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `totalSteps` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `lastUserMessageAt` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_type` ON `tasks` (`type`);--> statement-breakpoint
CREATE INDEX `idx_tasks_workflowId` ON `tasks` (`workflowId`);