PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`publicKey` text NOT NULL,
	`userId` text NOT NULL,
	`credentialID` text NOT NULL,
	`aaguid` text NOT NULL,
	`webauthnUserID` text,
	`counter` integer NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` integer NOT NULL,
	`transports` text,
	`createdAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_passkey`("id", "name", "publicKey", "userId", "credentialID", "aaguid", "webauthnUserID", "counter", "deviceType", "backedUp", "transports", "createdAt") SELECT "id", "name", "publicKey", "userId", "credentialID", "aaguid", "webauthnUserID", "counter", "deviceType", "backedUp", "transports", "createdAt" FROM `passkey`;--> statement-breakpoint
DROP TABLE `passkey`;--> statement-breakpoint
ALTER TABLE `__new_passkey` RENAME TO `passkey`;--> statement-breakpoint
PRAGMA foreign_keys=ON;