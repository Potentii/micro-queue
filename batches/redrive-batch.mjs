import {db} from "../repository/db.mjs";
import {QueueEntity} from "../repository/entities/queue-entity.mjs";
import {and, eq, gt, inArray, isNotNull, isNull, lt, or} from "drizzle-orm";
import {MessageEntity} from "../repository/entities/message-entity.mjs";
import * as uuid from "uuid";
import Logger from "@potentii/logger-js-pino";
import {alias} from "drizzle-orm/sqlite-core";


const DEFAULT_REDRIVE_BATCH_INTERVAL_MS = 5 * 1000;
const DEFAULT_REDRIVE_BATCH_PAGE_SIZE = 500;
const DEFAULT_REDRIVE_BATCH_DISABLED = false;

export default class RedriveBatch {

	static #intervalId;



	static async start() {
		const REDRIVE_BATCH_INTERVAL_MS = process.env.REDRIVE_BATCH_INTERVAL_MS?.trim()?.length ? Number(process.env.REDRIVE_BATCH_INTERVAL_MS) : DEFAULT_REDRIVE_BATCH_INTERVAL_MS;
		const REDRIVE_BATCH_PAGE_SIZE = process.env.REDRIVE_BATCH_PAGE_SIZE?.trim()?.length ? Number(process.env.REDRIVE_BATCH_PAGE_SIZE) : DEFAULT_REDRIVE_BATCH_PAGE_SIZE;
		const REDRIVE_BATCH_DISABLED = process.env.REDRIVE_BATCH_DISABLED?.trim()?.length ? process.env.REDRIVE_BATCH_DISABLED === 'true' : DEFAULT_REDRIVE_BATCH_DISABLED;


		if(REDRIVE_BATCH_DISABLED){
			Logger.info(`REDRIVE:BATCH:STARTED`, `Messages redrive batch disabled`);
			return;
		}


		RedriveBatch.#intervalId = setInterval(async () => {
			if(!RedriveBatch.#intervalId)
				return;

			const logger = Logger.subLogger();
			logger.set({ batch: 'redrive' });
			logger.info(`REDRIVE:BATCH:STARTED`, `Messages redrive batch started`);

			try{
				const now = new Date().toISOString();

				const m1Alias = alias(MessageEntity, 'm1');
				const q1Alias = alias(QueueEntity, 'q1');
				const q2Alias = alias(QueueEntity, 'q2');

				/**
				 *
				 * @type {{ m1: MessageEntity, q1: QueueEntity, q2: QueueEntity }[]}
				 */
				const messagesWithQueueForRedrive = await db()
					.select()
					.from(m1Alias)
					.where(
						and(
							eq(m1Alias.status, 'PROCESSING'),
							isNotNull(m1Alias.maxReceiveCount),
							eq(m1Alias.maxReceiveCount, m1Alias.receiveCount),
							isNotNull(m1Alias.processingTimeoutTs),
							lt(m1Alias.processingTimeoutTs, now),
							or(
								isNull(m1Alias.ttl),
								gt(m1Alias.ttl, m1Alias.processingTimeoutTs),
							),
						)
					)
					.innerJoin(q1Alias,
						and(
							eq(m1Alias.queueId, q1Alias.id),
							isNotNull(q1Alias.redriveQueueId),
						)
					)
					.innerJoin(q2Alias,
						and(
							eq(q1Alias.redriveQueueId, q2Alias.id),
						)
					)
					.limit(REDRIVE_BATCH_PAGE_SIZE);


				// console.log(messagesWithQueueForRedrive)

				logger.set({ messageQtyToRedrive: messagesWithQueueForRedrive.length });
				if(!messagesWithQueueForRedrive.length) {
					logger.info(`REDRIVE:BATCH:NO_MESSAGES`, `No messages to redrive`);
					return;
				}


				const messageIdsToRedrive = messagesWithQueueForRedrive.map(resultRow => resultRow.m1.id);
				logger.set({ messageIdsToRedrive: messageIdsToRedrive });


				// *Preparing the new DLQ messages and the original message updates:
				/**
				 *
				 * @type {{m1: MessageEntity, q1: QueueEntity, q2: QueueEntity, dlqMessage: MessageEntity, messageUpdate: MessageEntity}[]}
				 */
				const updatedResults = messagesWithQueueForRedrive.map(resultRow => {
					const originalMessage = resultRow.m1;
					const dlq = resultRow.q2;

					const ttl = (dlq.retentionTime!==null && dlq.retentionTime!==undefined)
						? new Date(Date.now() + dlq.retentionTime).toISOString()
						: undefined;

					/**
					 * @type {MessageEntity}
					 */
					const dlqMessage = {
						id: uuid.v4(),
						queueId: dlq.id,
						status: 'AVAILABLE',
						payload: originalMessage.payload,
						headers: originalMessage.headers,
						deduplicationId: originalMessage.deduplicationId ? 'redrive.' + originalMessage.deduplicationId : undefined,
						groupId: originalMessage.groupId,
						receiveCount: 0,
						maxReceiveCount: dlq.maxReceiveCount,
						redrivenToMessageId: undefined,
						ttl: ttl,
						creationTs: now,
						lastModifiedTs: now,
						processingTs: undefined,
						processedTs: undefined,
						redrivenTs: undefined,
						discardedTs: undefined,
					};
					resultRow.dlqMessage = dlqMessage;

					/**
					 * @type {MessageEntity}
					 */
					const messageUpdate = {
						status: 'REDRIVEN',
						lastModifiedTs: now,
						redrivenTs: now,
						redrivenToMessageId: dlqMessage.id,
					}
					resultRow.messageUpdate = messageUpdate;

					return resultRow;
				});
				// logger.set({ updatedResults: updatedResults });


				await db().transaction(async tx => {

					await tx
						.insert(MessageEntity)
						.values(updatedResults.map(resultRow => resultRow.dlqMessage));


					await Promise.all(
						updatedResults
							.map(resultRow => {

								return tx
									.update(MessageEntity)
									.set(resultRow.messageUpdate)
									.where(eq(MessageEntity.id, resultRow.m1.id));

							})
					);


				});
				logger.info(`REDRIVE:BATCH:FINISHED`, `Messages redrive batch finished`);
			} catch (err){
				logger.error(`REDRIVE:BATCH:ERROR`, `Messages redrive batch error`, err);
			}

		}, REDRIVE_BATCH_INTERVAL_MS);

	}


	static async stop(){
		if(RedriveBatch.#intervalId)
			clearInterval(RedriveBatch.#intervalId);
	}


}