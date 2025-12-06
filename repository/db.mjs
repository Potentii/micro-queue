import {drizzle} from 'drizzle-orm/libsql';
import {createClient} from '@libsql/client';
import process from "node:process";
import path from "node:path";

let _db = null;

export function db(){
	if(!_db){
		const client = createClient({ url: 'file:' + path.join(process.env.ROOT_PATH, '/micro-queue.db') });
		_db = drizzle(client);
	}

	return _db;
}

