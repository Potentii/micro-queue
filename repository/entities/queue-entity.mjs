import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';

/**
 * @typedef {'PAYLOAD_HASH'|'MANUAL'|'NONE'} EQueueDeduplicationMode
 */

export const QueueEntity = sqliteTable('queues', {
	id: text('id').notNull().unique().primaryKey(),
	visibilityTimeout: integer('visibility_timeout').notNull(),
	retentionTime: integer('retention_time'),
	maxReceiveCount: integer('max_receive_count'),
	redriveQueueId: text('redrive_queue_id'),
	/**
	 * @type {EQueueDeduplicationMode}
	 */
	deduplicationMode: text('deduplication_mode').notNull(),
	creationTs: text('creation_ts').notNull(),
	lastModifiedTs: text('last_modified_ts').notNull(),
});