import express from "express";
import {ApiError, RequestEnvelope, ResponseEnvelope} from "@potentii/rest-envelopes";
import Joi from "joi";
import * as uuid from "uuid";
import {db} from "../repository/db.mjs";
import {and, asc, eq, gt, isNull, lt, or} from "drizzle-orm";
import {expressjwt} from "express-jwt";
import {withToken} from "../utils/jwt-utils.mjs";
import {MessageEntity} from "../repository/entities/message-entity.mjs";
import {QueueEntity} from "../repository/entities/queue-entity.mjs";


export default class MessagesController {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {
		const router = express.Router();


		router.use(expressjwt({...withToken()}));


		// Polling
		// GET http://localhost:xxxx/api/v1/queues/:queueId/messages
		router.get(`/queues/:queueId/messages`, async (req, res, next) => {
			try {
				res.locals.logger.set({ queueId: req.params?.queueId });
				res.locals.logger.info(`MESSAGES:POLL:STARTED`, `Poll messages started`);

				// *Validating the request:
				const queueId = req.params.queueId;
				Joi.assert(queueId, Joi.string().required().label(`$params.queueId`));


				// *Checking if the queue exists:
				const queues = await db(req.auth.location)
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



				// *Getting the messages:
				const messagesAvailableForPolling = await db(req.auth.location)
					.select()
					.from(MessageEntity)
					.where(and(
						eq(MessageEntity.queueId, queueId),
						or(
							isNull(MessageEntity.ttl),
							gt(MessageEntity.ttl, new Date().toISOString()),
						),
						lt(MessageEntity.receiveCount, queue.maxReceiveCount),
						or(
							eq(MessageEntity.status, 'AVAILABLE'),
							and(
								eq(MessageEntity.status, 'PROCESSING'),
								lt(MessageEntity.processingTimeoutTs, new Date().toISOString()),
							),
						),
					))
					.orderBy(asc(MessageEntity.creationTs));

				res.locals.logger.set({ messagesAvailableForPolling: messagesAvailableForPolling });



				// TODO continuar



				// *Responding with success:
				res.status(200)
					.json(ResponseEnvelope.builder().data(searchResult).pagination(pagination).build())
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
				const queueId = req.params.queueId;
				Joi.assert(queueId, Joi.string().required().label(`$params.queueId`));

				const body = RequestEnvelope.from(req.body);

				Joi.assert(body, Joi.object({
					data: Joi.object({
						headers: Joi.object().optional().allow(null).label(`$body.data.headers`),
						payload: Joi.string().required().label(`$body.data.payload`),
					}).required().label(`$body.data`),
				}).required().label(`$body`));



				// *Checking if the queue exists:
				const queues = await db(req.auth.location)
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
						deduplicationId = body.data.headers?.deduplicationId;
						Joi.assert(deduplicationId, Joi.string().required().label(`$body.data.headers.deduplicationId`));
						break;
					case 'NONE':
					default:
						deduplicationId = undefined;
						break;
				}



				// *Checking if the message is duplicated:
				const messagesWithSameDeduplicationId = await db(req.auth.location)
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
					ttl: ttl,
					creationTs: nowTs,
					lastModifiedTs: nowTs,
					processingTs: undefined,
					discardedTs: undefined,
				};
				res.locals.logger.set({ messageEntity: messageEntity });


				const inserted = await db(req.auth.location)
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




		return router;
	}

}
