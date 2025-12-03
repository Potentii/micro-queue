import {drizzle} from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from "node:path";

const dbsByRoot = new Map();

// /**
//  *
//  * @param rootPath
//  * @returns {BetterSQLite3Database<Record<string, never>>}
//  */
export function db(rootPath){
	if(!dbsByRoot.has(rootPath)){
		const sqlite = new Database(path.join(rootPath, process.env.QUEUE_FOLDER_NAME, '/micro-queue.db'), {  });
		dbsByRoot.set(rootPath, drizzle(sqlite));
	}
	return dbsByRoot.get(rootPath);
}

