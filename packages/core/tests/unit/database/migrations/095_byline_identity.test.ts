import { Kysely, SqliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import { NodeSqliteCompatDatabase as BetterSqlite3 } from "#node-sqlite";

import { columnExists } from "../../../../src/database/dialect-helpers.js";
import { down, up } from "../../../../src/database/migrations/095_byline_identity.js";

describe("095_byline_identity migration", () => {
	let db: Kysely<Record<string, never>> | undefined;

	afterEach(async () => {
		await db?.destroy();
	});

	it("adds job_title and profile_links columns and supports rollback", async () => {
		const sqlite = new BetterSqlite3(":memory:");
		sqlite.exec(`
			CREATE TABLE _emdash_bylines (
				id TEXT PRIMARY KEY,
				slug TEXT NOT NULL,
				display_name TEXT NOT NULL
			)
		`);
		db = new Kysely<Record<string, never>>({
			dialect: new SqliteDialect({ database: sqlite }),
		});

		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(false);

		// Run up()
		await up(db);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(true);

		// Idempotent: running up() again should succeed
		await expect(up(db)).resolves.toBeUndefined();

		// Run down()
		await down(db);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(false);

		// Idempotent down(): running down() again should succeed without throwing
		await expect(down(db)).resolves.toBeUndefined();
	});
});
