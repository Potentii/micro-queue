import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';



/**
 * @typedef {'AVAILABLE'|'PROCESSING'|'PROCESSED'|'DISCARDED'} EMessageStatus
 */

export const MessageEntity = sqliteTable('messages', {
	id: text('id').notNull().unique().primaryKey(),
	queueId: text('queue_id').notNull(),
	/**
	 * @type {EMessageStatus}
	 */
	status: text('status').notNull(),
	payload: text('payload').notNull(),
	headers: text('headers').notNull(),
	deduplicationId: text('deduplication_id'),
	groupId: text('group_id').notNull(),
	receiveCount: integer('receive_count').notNull(),
	ttl: text('ttl'),
	creationTs: text('creation_ts').notNull(),
	lastModifiedTs: text('last_modified_ts').notNull(),
	processingTs: text('processing_ts'),
	processingTimeoutTs: text('processing_timeout_ts'),
	discardedTs: text('discarded_ts'),
});