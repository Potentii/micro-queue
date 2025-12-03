import Logger from "@potentii/logger-js-pino";
import Joi from "joi";
import Rest from "./rest.mjs";


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
Joi.assert(process.env.TOKEN_PUBLIC_KEY, Joi.string().required().label('$env.TOKEN_PUBLIC_KEY'));

if(!process.env.TOKEN_PUBLIC_KEY.startsWith('-----BEGIN PUBLIC KEY-----'))
	process.env.TOKEN_PUBLIC_KEY = Buffer.from(process.env.TOKEN_PUBLIC_KEY, 'base64url').toString('utf8');

// *Setting up the app's components:
await Rest.setup();


Logger.info(`APP:SETUP_COMPLETE`, `Application setup completed`);

