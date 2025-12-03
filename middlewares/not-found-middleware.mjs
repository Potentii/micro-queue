import {ApiError} from "@potentii/rest-envelopes";
import express from "express";


export default class NotFoundMiddleware {

	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build(){
		const router = express.Router();

		router.use((req, res, next) => {
			throw ApiError.create(404, `RESOURCE_NOT_FOUND`, `The requested resource could not be found`);
		});

		return router;
	}
}