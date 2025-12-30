ALTER TABLE `messages` ADD `follow_up_suggestions` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `follow_up_questions_enabled` integer DEFAULT true NOT NULL;