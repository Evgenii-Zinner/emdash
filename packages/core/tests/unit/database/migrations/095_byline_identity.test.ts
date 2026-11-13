import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterEach, beforeEach, expect, it } from "vitest";

import { columnExists } from "../../../../src/database/dialect-helpers.js";
import { down, up } from "../../../../src/database/migrations/095_byline_identity.js";
import {
	createForDialect,
	describeEachDialect,
	teardownForDialect,
	type DialectTestContext,
} from "../../../utils/test-db.js";

describeEachDialect("095_byline_identity migration", (dialect) => {
	let ctx: DialectTestContext;
	let db: Kysely<unknown>;

	beforeEach(async () => {
		ctx = await createForDialect(dialect);
		db = ctx.db as unknown as Kysely<unknown>;
		await db.schema
			.createTable("users")
			.addColumn("id", "text", (col) => col.primaryKey())
			.addColumn("email", "text", (col) => col.notNull())
			.execute();
		await db.schema
			.createTable("_emdash_bylines")
			.addColumn("id", "text", (col) => col.primaryKey())
			.addColumn("slug", "text", (col) => col.notNull())
			.addColumn("display_name", "text", (col) => col.notNull())
			.execute();
	});

	afterEach(async () => {
		await teardownForDialect(ctx);
	});

	it("adds users.profile_links and byline columns and supports rollback", async () => {
		expect(await columnExists(db, "users", "profile_links")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(false);

		// Run up()
		await up(db);
		expect(await columnExists(db, "users", "profile_links")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(true);

		// Idempotent: running up() again should succeed
		await expect(up(db)).resolves.toBeUndefined();

		// Run down()
		await down(db);
		expect(await columnExists(db, "users", "profile_links")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(false);

		// Idempotent down(): running down() again should succeed without throwing
		await expect(down(db)).resolves.toBeUndefined();
	});

	it("restarts cleanly when users.profile_links was already added", async () => {
		await sql`ALTER TABLE users ADD COLUMN profile_links TEXT`.execute(db);
		expect(await columnExists(db, "users", "profile_links")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(false);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(false);

		await up(db);

		expect(await columnExists(db, "users", "profile_links")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "job_title")).toBe(true);
		expect(await columnExists(db, "_emdash_bylines", "profile_links")).toBe(true);
	});
});
