import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';



/**
 * @typedef {'AVAILABLE'|'PROCESSING'|'PROCESSED'|'DISCARDED'|'REDRIVEN'} EMessageStatus
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
	maxReceiveCount: integer('max_receive_count'),
	redrivenToMessageId: integer('redriven_to_message_id'),
	ttl: text('ttl'),
	creationTs: text('creation_ts').notNull(),
	lastModifiedTs: text('last_modified_ts').notNull(),
	processingTs: text('processing_ts'),
	processingTimeoutTs: text('processing_timeout_ts'),
	processedTs: text('processed_ts'),
	redrivenTs: text('redriven_ts'),
	discardedTs: text('discarded_ts'),
});