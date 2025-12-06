import RedriveBatch from "./batches/redrive-batch.mjs";
import TtlBatch from "./batches/ttl-batch.mjs";

export default class Batches {

	static async start() {
		await Promise.any([
			RedriveBatch.start(),
			TtlBatch.start(),
		]);
	}

	static async stop() {
		await Promise.any([
			RedriveBatch.stop(),
			TtlBatch.stop(),
		]);
	}

}