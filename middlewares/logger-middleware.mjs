import express from "express";
import Logger from "@potentii/logger-js-pino";


export default class LoggerMiddleware {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {
		const router = express.Router();

		router.use((req, res, next) => {
			res.locals.logger = Logger.subLogger();
			// res.logger = Logger.dynamic({});
			next();
		});

		return router;
	}
}