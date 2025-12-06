import express from "express";
import {ApiError, RequestEnvelope, ResponseEnvelope} from "@potentii/rest-envelopes";
import Joi from "joi";
import * as uuid from "uuid";
import {db} from "../repository/db.mjs";
import {and, eq, inArray, sql} from "drizzle-orm";
import {MessageEntity} from "../repository/entities/message-entity.mjs";
import {QueueEntity} from "../repository/entities/queue-entity.mjs";
import crypto from "node:crypto";
import {alias} from 'drizzle-orm/sqlite-core';

export default class MessagesController {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {
		const router = express.Router();



		// Polling
		// GET http://localhost:xxxx/api/v1/queues/:queueId/messages
		router.get(`/queues/:queueId/messages`, async (req, res, next) => {
			try {
				res.locals.logger.set({ reqQuery: req.query });
				res.locals.logger.set({ queueId: req.params?.queueId });
				res.locals.logger.info(`MESSAGES:POLL:STARTED`, `Poll messages started`);

				// *Validating the request:
				const queueId = req.params?.queueId;
				Joi.assert(queueId, Joi.string().required().label(`$params.queueId`));


				const quantity = req.query?.quantity;
				Joi.assert(quantity, Joi.number().integer().min(1).max(100).required().label(`$query.quantity`));

				let onlyQuery = req.query?.onlyQuery;
				Joi.assert(onlyQuery, Joi.bool().optional().allow(null).label(`$query.onlyQuery`));
				onlyQuery = onlyQuery === 'true';



				// *Checking if the queue exists:
				const queues = await db()
					.select()
					.from(QueueEntity)
					.where(eq(QueueEntity.id, queueId))
					.limit(1);
				res.locals.logger.set({ queues: queues });

				if(!queues?.length){
					throw ApiError.builder()
						.status(404)
						.internalCode(`MESSAGES:POLL:QUEUE_NOT_FOUND`)
						.code(`MESSAGES:POLL:QUEUE_NOT_FOUND`)
						.message(`Queue could not be found`)
						.build();
				}

				const queue = queues[0];
				res.locals.logger.set({ queue: queue });




				const now = new Date().toISOString();

				const aliasM1 = alias(MessageEntity, 'm1');
				const aliasM2 = alias(MessageEntity, 'm2');

				const query = sql`
					WITH RankedMessages AS (
						SELECT
							*,
							ROW_NUMBER() OVER (PARTITION BY ${aliasM1.groupId} ORDER BY ${aliasM1.creationTs} ASC) AS rn
						FROM ${MessageEntity} ${aliasM1}
						WHERE ${aliasM1.queueId} = ${queueId}
							AND (${aliasM1.ttl} IS NULL OR ${aliasM1.ttl} > ${now})
							AND (${aliasM1.status} = 'AVAILABLE' OR (${aliasM1.status} = 'PROCESSING' AND ${aliasM1.processingTimeoutTs} < ${now}))
							AND (${aliasM1.maxReceiveCount} IS NULL OR ${aliasM1.receiveCount} < ${aliasM1.maxReceiveCount})
						  	AND NOT EXISTS (
								SELECT 1
								FROM ${MessageEntity} ${aliasM2}
								WHERE ${aliasM2.groupId} = ${aliasM1.groupId}
									AND ${aliasM2.queueId} = ${aliasM1.queueId}
									AND ${aliasM2.status} = 'PROCESSING'
									AND (${aliasM2.processingTimeoutTs} IS NULL OR ${aliasM2.processingTimeoutTs} > ${now})
								  	AND (${aliasM2.maxReceiveCount} IS NULL OR ${aliasM2.receiveCount} < ${aliasM2.maxReceiveCount})
							)
					)
					SELECT *
					FROM RankedMessages
					WHERE rn = 1
						LIMIT ${quantity};
				`;

				const messagesAvailableForPolling = await db().all(query);
				res.locals.logger.set({ messagesAvailableForPolling: messagesAvailableForPolling });




				if(!onlyQuery && messagesAvailableForPolling.length){
					const messageIds = messagesAvailableForPolling.map(message => message.id);

					const nowUnix = Date.now();
					const now = new Date(nowUnix).toISOString();
					const processingTimeoutTs = new Date(nowUnix + queue.visibilityTimeout).toISOString();

					await db().update(MessageEntity)
						.set({
							status: 'PROCESSING',
							lastModifiedTs: now,
							processingTs: now,
							processingTimeoutTs: processingTimeoutTs,
							receiveCount: sql`${MessageEntity.receiveCount} + 1`,
						})
						.where(inArray(MessageEntity.id, messageIds));

				}


				const responseBody = messagesAvailableForPolling.map(message => ({
					id: message.id,
					payload: message.payload,
					headers: JSON.parse(message.headers),
				}));
				res.locals.logger.set({ responseBody: responseBody });

				// *Responding with success:
				res.status(200)
					.json(ResponseEnvelope.builder().data(responseBody).build())
					.end();


				res.locals.logger.info(`MESSAGES:POLL:FINISHED`, `Poll messages finished`);
			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`MESSAGES:POLL:FAILED`)
					.code(`MESSAGES:POLL:FAILED`)
					.message(`Poll messages failed`)
					.cause(err)
					.build();
			}
		});



		// POST http://localhost:xxxx/api/v1/queues/:queueId/messages
		router.post(`/queues/:queueId/messages`, async (req, res, next) => {
			try {
				res.locals.logger.set({ reqBody: req.body });
				res.locals.logger.set({ queueId: req.params?.queueId });
				res.locals.logger.info(`MESSAGES:POST:STARTED`, `Message post started`);

				// *Validating the request:
				const queueId = req.params?.queueId;
				Joi.assert(queueId, Joi.string().required().label(`$params.queueId`));

				const body = RequestEnvelope.from(req.body);

				Joi.assert(body, Joi.object({
					data: Joi.object({
						headers: Joi.object().optional().allow(null).label(`$body.data.headers`),
						payload: Joi.string().required().label(`$body.data.payload`),
					}).required().label(`$body.data`),
				}).required().label(`$body`));



				// *Checking if the queue exists:
				const queues = await db()
					.select()
					.from(QueueEntity)
					.where(eq(QueueEntity.id, queueId))
					.limit(1);
				res.locals.logger.set({ queues: queues });

				if(!queues?.length){
					throw ApiError.builder()
						.status(404)
						.internalCode(`MESSAGES:POST:QUEUE_NOT_FOUND`)
						.code(`MESSAGES:POST:QUEUE_NOT_FOUND`)
						.message(`Queue could not be found`)
						.build();
				}

				const queue = queues[0];
				res.locals.logger.set({ queue: queue });



				// *Generating the deduplication id:
				const queueDeduplicationMode = queue.deduplicationMode;
				let deduplicationId = undefined;

				switch (queueDeduplicationMode) {
					case 'PAYLOAD_HASH':
						deduplicationId = crypto.createHash('sha256').update(body.data.payload).digest('hex');
						break;
					case 'MANUAL':
						deduplicationId = body.data.headers?.['X-Deduplication-Id'];
						Joi.assert(deduplicationId, Joi.string().required().label(`$body.data.headers.X-Deduplication-Id`));
						break;
					case 'NONE':
					default:
						deduplicationId = undefined;
						break;
				}



				// *Checking if the message is duplicated:
				const messagesWithSameDeduplicationId = await db()
					.select()
					.from(MessageEntity)
					.where(eq(MessageEntity.deduplicationId, deduplicationId));
				res.locals.logger.set({ messagesWithSameDeduplicationId: messagesWithSameDeduplicationId });

				if(messagesWithSameDeduplicationId?.length){
					// *Responding with success (processing):
					res.status(202)
						.json(ResponseEnvelope.withData({
							id: messagesWithSameDeduplicationId[0].id,
						}))
						.end();

					res.locals.logger.info(`MESSAGES:POST:IGNORED_DUPLICATED`, `Message post ignored, duplicated`);

					return;
				}



				// *Inserting the message:
				const payload = body.data.payload;
				const headers = JSON.stringify(body.data.headers || {});
				const groupId = body.data.headers?.['X-Group-Id'] || uuid.v4();
				const ttl = (queue.retentionTime!==null && queue.retentionTime!==undefined)
					? new Date(Date.now() + queue.retentionTime).toISOString()
					: undefined;
				const nowTs = new Date().toISOString();

				/**
				 *
				 * @type {MessageEntity}
				 */
				const messageEntity = {
					id: uuid.v4(),
					queueId: queue.id,
					status: 'AVAILABLE',
					payload: payload,
					headers: headers,
					deduplicationId: deduplicationId,
					groupId: groupId,
					receiveCount: 0,
					maxReceiveCount: queue.maxReceiveCount,
					redrivenToMessageId: undefined,
					ttl: ttl,
					creationTs: nowTs,
					lastModifiedTs: nowTs,
					processingTs: undefined,
					processedTs: undefined,
					redrivenTs: undefined,
					discardedTs: undefined,
				};
				res.locals.logger.set({ messageEntity: messageEntity });


				const inserted = await db()
					.insert(MessageEntity)
					.values(messageEntity);
				res.locals.logger.set({ inserted: inserted });



				// *Responding with success:
				const responseBody = {
					id: messageEntity.id,
				};
				res.status(201)
					.json(ResponseEnvelope.withData(responseBody))
					.end();


				res.locals.logger.info(`MESSAGES:POST:FINISHED`, `Message post finished`);
			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`MESSAGES:POST:FAILED`)
					.code(`MESSAGES:POST:FAILED`)
					.message(`Message post failed`)
					.cause(err)
					.build();
			}
		});



		// Acknowledgement
		// DELETE http://localhost:xxxx/api/v1/queues/:queueId/messages/:messageId
		router.delete(`/queues/:queueId/messages/:messageId`, async (req, res, next) => {
			try {
				res.locals.logger.set({ reqBody: req.body });
				res.locals.logger.set({ queueId: req.params?.queueId });
				res.locals.logger.set({ messageId: req.params?.messageId });
				res.locals.logger.info(`MESSAGES:ACK:STARTED`, `Message ACK started`);

				// *Validating the request:
				const queueId = req.params?.queueId;
				Joi.assert(queueId, Joi.string().required().label(`$params.queueId`));
				const messageId = req.params?.messageId;
				Joi.assert(messageId, Joi.string().required().label(`$params.messageId`));

				// *Checking if the message exists:
				const messages = await db()
					.select()
					.from(MessageEntity)
					.where(
						and(
							eq(MessageEntity.id, messageId),
							eq(MessageEntity.queueId, queueId),
							eq(MessageEntity.status, 'PROCESSING'),
						)
					)
					.limit(1);
				res.locals.logger.set({ messages: messages });

				if(!messages?.length){
					throw ApiError.builder()
						.status(404)
						.internalCode(`MESSAGES:ACK:MESSAGE_NOT_FOUND`)
						.code(`MESSAGES:ACK:MESSAGE_NOT_FOUND`)
						.message(`Message could not be found`)
						.build();
				}

				const message = messages[0];
				res.locals.logger.set({ message: message });


				const now = new Date().toISOString();

				await db()
					.update(MessageEntity)
					.set({
						status: 'PROCESSED',
						lastModifiedTs: now,
						processedTs: now,
					})
					.where(eq(MessageEntity.id, messageId));

				// *Responding with success:
				res.status(204)
					.end();

				res.locals.logger.info(`MESSAGES:ACK:FINISHED`, `Message ACK finished`);
			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`MESSAGES:ACK:FAILED`)
					.code(`MESSAGES:ACK:FAILED`)
					.message(`Message ACK failed`)
					.cause(err)
					.build();
			}
		});




		return router;
	}

}
