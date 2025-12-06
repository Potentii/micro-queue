
-- DROP TABLE IF EXISTS queues;
-- DROP TABLE IF EXISTS messages;

CREATE TABLE IF NOT EXISTS queues(
	`id` TEXT NOT NULL UNIQUE PRIMARY KEY,
	`visibility_timeout` INTEGER NOT NULL,
	`retention_time` INTEGER,
	`max_receive_count` INTEGER,
	`redrive_queue_id` TEXT,
	`deduplication_mode` TEXT NOT NULL,
	`creation_ts` TEXT NOT NULL,
	`last_modified_ts` TEXT NOT NULL,
	FOREIGN KEY (`redrive_queue_id`) REFERENCES queues(`id`)
);

CREATE TABLE IF NOT EXISTS messages(
	`id` TEXT NOT NULL UNIQUE PRIMARY KEY,
	`queue_id` TEXT NOT NULL,
	`status` TEXT NOT NULL,
	`payload` TEXT NOT NULL,
	`headers` TEXT NOT NULL,
	`deduplication_id` TEXT,
	`group_id` TEXT NOT NULL,
	`receive_count` INTEGER NOT NULL,
	`max_receive_count` INTEGER,
	`redriven_to_message_id` TEXT,
	`ttl` TEXT,
	`creation_ts` TEXT NOT NULL,
	`last_modified_ts` TEXT NOT NULL,
	`processing_ts` TEXT,
	`processing_timeout_ts` TEXT,
	`processed_ts` TEXT,
	`redriven_ts` TEXT,
	`discarded_ts` TEXT,
	FOREIGN KEY (`queue_id`) REFERENCES queues(`id`),
	FOREIGN KEY (`redriven_to_message_id`) REFERENCES messages(`id`)
);
