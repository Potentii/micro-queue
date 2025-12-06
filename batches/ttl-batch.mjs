import {db} from "../repository/db.mjs";
import {and, asc, inArray, isNotNull, isNull, lt, or} from "drizzle-orm";
import {MessageEntity} from "../repository/entities/message-entity.mjs";
import Logger from "@potentii/logger-js-pino";


const DEFAULT_TTL_BATCH_INTERVAL_MS = 30 * 1000;
const DEFAULT_TTL_BATCH_PAGE_SIZE = 500;
const DEFAULT_TTL_BATCH_DISABLED = false;

export default class TtlBatch {

	static #intervalId;



	static async start() {
		const TTL_BATCH_INTERVAL_MS = process.env.TTL_BATCH_INTERVAL_MS?.trim()?.length ? Number(process.env.TTL_BATCH_INTERVAL_MS) : DEFAULT_TTL_BATCH_INTERVAL_MS;
		const TTL_BATCH_PAGE_SIZE = process.env.TTL_BATCH_PAGE_SIZE?.trim()?.length ? Number(process.env.TTL_BATCH_PAGE_SIZE) : DEFAULT_TTL_BATCH_PAGE_SIZE;
		const TTL_BATCH_DISABLED = process.env.TTL_BATCH_DISABLED?.trim()?.length ? process.env.TTL_BATCH_DISABLED === 'true' : DEFAULT_TTL_BATCH_DISABLED;


		if(TTL_BATCH_DISABLED){
			Logger.info(`TTL:BATCH:DISABLED`, `Messages TTL batch disabled`);
			return;
		}


		TtlBatch.#intervalId = setInterval(async () => {
			if(!TtlBatch.#intervalId)
				return;

			const logger = Logger.subLogger();
			logger.set({ batch: 'ttl' });
			logger.info(`TTL:BATCH:STARTED`, `Messages TTL batch started`);

			try{
				const now = new Date().toISOString();


				/**
				 *
				 * @type {MessageEntity[]}
				 */
				const messagesToDiscard = await db()
					.select()
					.from(MessageEntity)
					.where(
						and(
							// ne(MessageEntity.status, 'DISCARDED'),
							isNotNull(MessageEntity.ttl),
							lt(MessageEntity.ttl, now),
							or(
								isNull(MessageEntity.processingTimeoutTs),
								lt(MessageEntity.processingTimeoutTs, now),
							)
						)
					)
					.orderBy(asc(MessageEntity.creationTs))
					.limit(TTL_BATCH_PAGE_SIZE);


				logger.set({ messageQtyToDiscard: messagesToDiscard.length });
				if(!messagesToDiscard.length) {
					logger.info(`TTL:BATCH:NO_MESSAGES`, `No messages to discard`);
					return;
				}


				const messageIdsToDiscard = messagesToDiscard.map(m => m.id);
				logger.set({ messageIdsToDiscard: messageIdsToDiscard });


				// await db()
				// 	.update(MessageEntity)
				// 	.set({
				// 		status: 'DISCARDED',
				// 		lastModifiedTs: now,
				// 		discardedTs: now,
				// 	})
				// 	.where(inArray(MessageEntity.id, messageIdsToDiscard));


				await db()
					.delete(MessageEntity)
					.where(inArray(MessageEntity.id, messageIdsToDiscard));

				logger.info(`TTL:BATCH:FINISHED`, `Messages TTL batch finished`);
			} catch (err){
				logger.error(`TTL:BATCH:ERROR`, `Messages TTL batch error`, err);
			}

		}, TTL_BATCH_INTERVAL_MS);

	}


	static async stop(){
		if(TtlBatch.#intervalId)
			clearInterval(TtlBatch.#intervalId);
	}


}