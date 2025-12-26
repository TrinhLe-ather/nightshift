-- Add repo_locks table for shared/exclusive locking
CREATE TABLE `repo_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`repoId` text NOT NULL,
	`taskId` text NOT NULL,
	`type` text NOT NULL,
	`acquiredAt` text NOT NULL,
	FOREIGN KEY (`repoId`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create indexes for efficient queries
CREATE INDEX `idx_repo_locks_repoId` ON `repo_locks` (`repoId`);
CREATE INDEX `idx_repo_locks_taskId` ON `repo_locks` (`taskId`);
CREATE INDEX `idx_repo_locks_type` ON `repo_locks` (`type`);
