DROP TABLE `sync_queue`;--> statement-breakpoint
DROP INDEX `idx_tasks_source`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `needsHumanCode`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `needsHumanQuestion`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `clarificationResponse`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `remoteId`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `source`;