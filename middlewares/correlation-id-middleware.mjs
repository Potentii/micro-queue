import express from "express";
import * as uuid from "uuid";


export default class CorrelationIdMiddleware {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {
		const router = express.Router();

		router.use((req, res, next) => {
			let correlationId = req.header('X-Corr-Id');

			if (!correlationId?.trim()?.length) {
				correlationId = uuid.v4();
				res.locals.logger.set({ missingCorrelationId: true });
				res.locals.logger.warn(`REQUEST_MISSING_CORRELATION`, `A request is missing the correlation ID`, null, { correlationId: correlationId, req: { method: req.method, route: req.originalUrl, headers: req.headers, query: req.query } });
			}

			res.header('X-Corr-Id', correlationId);

			res.locals.logger.set({ correlationId: correlationId });

			res.locals.correlationId = correlationId;

			next();
		});

		return router;
	}
}