import Logger from "@potentii/logger-js-pino";
import Joi from "joi";
import Rest from "./rest.mjs";
import Batches from "./batches.mjs";
import process from "node:process";


// *Global error handling:
process
	.on('unhandledRejection', (reason, promise) => {
		Logger.error(`APP:UNHANDLED_PROMISE_REJECTION`, `Promise resulted in error`, reason, { promise: promise, event: 'unhandledRejection' });
	})
	.on('uncaughtException', err => {
		Logger.error(`APP:UNCAUGHT_EXCEPTION`, `Uncaught exception`, err, { event: 'uncaughtException' });
		if(err.code === 1){
			process.abort();
			return;
		}
		process.exit(err.code);
	});


// *Logger config:
Logger.customField({ service: process.env.LOGGER__SERVICE })


// *Application setup:
Logger.info(`APP:SETUP_STARTED`, `Application setup starting`);


// *Validating the environment:
Joi.assert(process.env.PORT, Joi.number().required().min(0).label('$env.PORT'));
Joi.assert(process.env.IS_HTTPS, Joi.bool().optional().allow(null).label('$env.IS_HTTPS'));

Joi.assert(process.env.REDRIVE_BATCH_INTERVAL_MS, Joi.number().optional().allow(null).min(300).label('$env.REDRIVE_BATCH_INTERVAL_MS'));
Joi.assert(process.env.REDRIVE_BATCH_PAGE_SIZE, Joi.number().optional().allow(null).min(1).label('$env.REDRIVE_BATCH_PAGE_SIZE'));
Joi.assert(process.env.REDRIVE_BATCH_DISABLED, Joi.bool().optional().allow(null).label('$env.REDRIVE_BATCH_DISABLED'));

Joi.assert(process.env.TTL_BATCH_INTERVAL_MS, Joi.number().optional().allow(null).min(300).label('$env.TTL_BATCH_INTERVAL_MS'));
Joi.assert(process.env.TTL_BATCH_PAGE_SIZE, Joi.number().optional().allow(null).min(1).label('$env.TTL_BATCH_PAGE_SIZE'));
Joi.assert(process.env.TTL_BATCH_DISABLED, Joi.bool().optional().allow(null).label('$env.TTL_BATCH_DISABLED'));

Joi.assert(process.env.ROOT_PATH, Joi.string().required().uri().label('$env.ROOT_PATH'));


// *Setting up the app's components:
await Rest.setup();
await Batches.start();


Logger.info(`APP:SETUP_COMPLETE`, `Application setup completed`);

