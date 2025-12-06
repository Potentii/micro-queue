import express from "express";
import {ApiError, RequestEnvelope, ResponseEnvelope} from "@potentii/rest-envelopes";
import Joi from "joi";
import {db} from "../repository/db.mjs";
import {eq} from "drizzle-orm";
import {QueueEntity} from "../repository/entities/queue-entity.mjs";


export default class QueuesController {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {
		const router = express.Router();



		// Upsert
		// PUT http://localhost:xxxx/api/v1/queues
		router.put(`/queues`, async (req, res, next) => {
			try {
				res.locals.logger.set({ reqBody: req.body });
				res.locals.logger.info(`QUEUES:UPSERT:STARTED`, `Queue upsert started`);

				// *Validating the request:
				const body = RequestEnvelope.from(req.body);

				Joi.assert(body, Joi.object({
					data: Joi.object({
						id: Joi.string().required().min(1).max(128).regex(/^[a-z0-9-_.]+$/).label(`$body.data.id`),
						visibilityTimeout: Joi.number().required().integer().min(1000).max(1 * 60 * 60 * 1000).label(`$body.data.visibilityTimeout`),
						retentionTime: Joi.number().optional().allow(null).integer().min(10 * 1000).label(`$body.data.retentionTime`),
						maxReceiveCount: Joi.number().optional().allow(null).integer().min(1).label(`$body.data.maxReceiveCount`),
						redriveQueueId: Joi.string().optional().allow(null).label(`$body.data.redriveQueueId`),
						deduplicationMode: Joi.string().required().allow('PAYLOAD_HASH', 'MANUAL', 'NONE').label(`$body.data.deduplicationMode`),
					}).required().label(`$body.data`),
				}).required().label(`$body`));



				const queueId = body.data.id;

				// *Trying to get the existing queue:
				const queues = await db()
					.select()
					.from(QueueEntity)
					.where(eq(QueueEntity.id, queueId))
					.limit(1);
				const existingQueue = queues?.[0];
				res.locals.logger.set({ existingQueue: existingQueue });

				const nowTs = new Date().toISOString();



				// *Upserting the entity:
				/**
				 * @type {QueueEntity}
				 */
				const queueEntity = {
					id: queueId,
					visibilityTimeout: req.body.data.visibilityTimeout,
					retentionTime: req.body.data.retentionTime,
					maxReceiveCount: req.body.data.maxReceiveCount,
					redriveQueueId: req.body.data.redriveQueueId,
					deduplicationMode: req.body.data.deduplicationMode,
					creationTs: existingQueue ? existingQueue.creationTs : nowTs,
					lastModifiedTs: nowTs,
				};
				res.locals.logger.set({ queueEntity: queueEntity });

				if(existingQueue){
					await db()
						.update(QueueEntity)
						.set(queueEntity)
						.where(eq(QueueEntity.id, queueEntity.id));
				} else{
					await db()
						.insert(QueueEntity)
						.values(queueEntity);
				}



				// *Responding with success:
				const responseBody = {
					...queueEntity,
				};
				res.status(existingQueue ? 200 : 201)
					.json(ResponseEnvelope.withData(responseBody))
					.end();


				res.locals.logger.info(`QUEUES:UPSERT:FINISHED`, `Queue upsert finished`);
			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`QUEUES:UPSERT:FAILED`)
					.code(`QUEUES:UPSERT:FAILED`)
					.message(`Queue upsert failed`)
					.cause(err)
					.build();
			}
		});




		return router;
	}

}
