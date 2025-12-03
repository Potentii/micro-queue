import https from 'https';
import express from 'express';
import cors from 'cors';
import Logger from "@potentii/logger-js-pino";
import NotFoundMiddleware from "./middlewares/not-found-middleware.mjs";
import CorrelationIdMiddleware from "./middlewares/correlation-id-middleware.mjs";
import ErrorHandlerMiddleware from "./middlewares/error-handler-middleware.mjs";
import LoggerMiddleware from "./middlewares/logger-middleware.mjs";
import fs from "node:fs";
import path from "node:path";
import MessagesController from "./routes/messages-controller.mjs";

export default class Rest {

	static async setup() {
		Logger.info(`REST:SETUP_STARTED`, `Rest APIs setup started`);

		const port = process.env.PORT;
		const hostname = process.env.HOSTNAME || 'localhost';


		// *Retrieving custom certificates:
		const options = {
			key: await fs.promises.readFile(path.join(import.meta.dirname, `certs`, `server.key`)),
			cert: await fs.promises.readFile(path.join(import.meta.dirname, `certs`, `server.cert`)),
		};


		// *Configuring express middlewares:
		const app = express();
		const srv = https.createServer(options, app);

		// app.use(cors());
		app.use(cors({
			credentials: true,
			origin: (origin, callback) => callback(null, true),
		}));
		app.use(express.json());

		app.use(await LoggerMiddleware.build());
		app.use(await CorrelationIdMiddleware.build());

		// *Registering the application endpoints:
		app.use(`/api/v1`, await MessagesController.build());


		app.use(await NotFoundMiddleware.build());
		await ErrorHandlerMiddleware.build(app)





		// *Starting the HTTP server:
		srv.listen(port, hostname, err => {
			Logger.info(`REST:SETUP_COMPLETED`, `Rest APIs started @ https://${hostname}:${port}`, {href: `https://${hostname}:${port}`});
		});
	}

}