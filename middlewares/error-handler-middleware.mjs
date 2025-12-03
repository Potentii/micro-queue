import {ApiError, ApiErrorDetail, ResponseEnvelope} from '@potentii/rest-envelopes';
import Joi from 'joi';
import Logger from "@potentii/logger-js-pino";
import * as uuid from "uuid";


export default class ErrorHandlerMiddleware {

	/**
	 *
	 * @param {Express} router
	 */
	static async build(router){
		router.use((err, req, res, next) => {
			if(res.headersSent)
				return next(err);

			// *Converting Joi validation:
			err = ErrorHandlerMiddleware.#joiErrorConverter(err);

			// *Converting JWT exceptions:
			err = ErrorHandlerMiddleware.#jwtExpressErrorConverter(err);

			// *Converting general exceptions:
			err = ErrorHandlerMiddleware.#unknownErrorConverter(err);

			// *Setting the response status:
			if(err.status && err.status > 99 && err.status < 600){
				res.status(err.status);
			} else{
				res.status(500);
			}

			// *Creating a track id if none was set:
			if(!err.track)
				err.track = uuid.v4();

			// *Logging the error:
			(res.locals?.logger || Logger).error(
				(err.internalCode || err.code)
					? `${err.internalCode} - ${err.code}`
					: `???`,
				err.message,
				err.stack,
				{
					track: err.track,
					correlationId: res.locals?.correlationId,
					auth: req.auth,
					req: {
						method: req.method,
						route: req.originalUrl,
						headers: req.headers,
						query: req.query,
						body: req.body
					}
				});

			// *Sending the response:
			res.json(ResponseEnvelope.withError(err)).end();
		});
	}


	/**
	 *
	 * @param {Error} err
	 * @return {ApiError|Error}
	 */
	static #joiErrorConverter(err){
		if(err instanceof Joi.ValidationError)
			return ApiError.builder()
				.status(400)
				.internalCode(`ERROR_HANDLER:JOI_VALIDATION`)
				.code(`VALIDATION_ERROR`)
				.message(err.message)
				.errors(err?.details?.map?.(detail => ApiErrorDetail.create(`VALIDATION_ERROR_ITEM`, detail?.message, detail?.context?.label, detail?.context?.value)))
				.cause(err)
				.build();
		return err;
	}


	/**
	 *
	 * @param {Error} err
	 * @return {ApiError}
	 */
	static #jwtExpressErrorConverter(err){
		if(err?.inner?.name === 'JsonWebTokenError' || ['credentials_bad_scheme', 'credentials_bad_format', 'credentials_required', 'invalid_token', 'revoked_token'].includes(err?.code))
			return ApiError.builder()
				.status(401)
				.internalCode(`ERROR_HANDLER:INVALID_JWT_TOKEN`)
				.code(`UNAUTHORIZED`)
				.message(`Unauthorized`)
				.cause(err)
				.build();
		return err;
	}



	/**
	 *
	 * @param {Error} err
	 * @return {ApiError}
	 */
	static #unknownErrorConverter(err){
		if(!(err instanceof ApiError))
			return ApiError.builder()
				.status(500)
				.internalCode(`ERROR_HANDLER:UNKNOWN_ERROR`)
				.code(`UNEXPECTED_ERROR`)
				.message(`Unexpected error: ${err.message}`)
				.cause(err)
				.build();
		return err;
	}

}