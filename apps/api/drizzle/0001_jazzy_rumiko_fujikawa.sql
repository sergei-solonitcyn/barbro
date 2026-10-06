CREATE TABLE `user_identity` (
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	PRIMARY KEY(`provider`, `subject`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_identity_user_id_idx` ON `user_identity` (`user_id`);