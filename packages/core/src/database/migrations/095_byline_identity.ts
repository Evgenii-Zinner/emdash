import type { Kysely } from "kysely";
import { sql } from "kysely";

import { columnExists, isPostgres } from "../dialect-helpers.js";

const DUPLICATE_COLUMN_RE = /(?:duplicate column|column .* already exists|already exists.*column)/i;

/**
 * Migration 095: Byline Identity Foundation (Phase 1 of RFC #4765).
 * Purely additive: adds nullable `job_title` and `profile_links` to `_emdash_bylines`.
 */
async function hasColumn(db: Kysely<unknown>, table: string, column: string): Promise<boolean> {
	if (isPostgres(db)) {
		return columnExists(db, table, column);
	}
	try {
		const rows = await sql<{ name: string }>`PRAGMA table_info(${sql.ref(table)})`.execute(db);
		return rows.rows.some((r) => r.name === column);
	} catch {
		return columnExists(db, table, column);
	}
}

async function addColumnIfMissing(
	db: Kysely<unknown>,
	column: string,
	addColumn: () => Promise<void>,
): Promise<void> {
	if (await hasColumn(db, "_emdash_bylines", column)) return;

	try {
		await addColumn();
	} catch (error) {
		if (DUPLICATE_COLUMN_RE.test(deepErrorMessage(error))) {
			if (await hasColumn(db, "_emdash_bylines", column)) return;
		}
		throw error;
	}
}

function deepErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const own = error.message ?? "";
		if (error.cause) {
			const causeMessage = deepErrorMessage(error.cause);
			return own ? `${own}: ${causeMessage}` : causeMessage;
		}
		return own;
	}
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export async function up(db: Kysely<unknown>): Promise<void> {
	await addColumnIfMissing(db, "job_title", () =>
		db.schema.alterTable("_emdash_bylines").addColumn("job_title", "text").execute(),
	);
	await addColumnIfMissing(db, "profile_links", () =>
		db.schema.alterTable("_emdash_bylines").addColumn("profile_links", "text").execute(),
	);
}

export async function down(db: Kysely<unknown>): Promise<void> {
	if (await hasColumn(db, "_emdash_bylines", "profile_links")) {
		try {
			await db.schema.alterTable("_emdash_bylines").dropColumn("profile_links").execute();
		} catch {
			// Tolerated on dialects/environments that restrict DROP COLUMN
		}
	}
	if (await hasColumn(db, "_emdash_bylines", "job_title")) {
		try {
			await db.schema.alterTable("_emdash_bylines").dropColumn("job_title").execute();
		} catch {
			// Tolerated on dialects/environments that restrict DROP COLUMN
		}
	}
}
