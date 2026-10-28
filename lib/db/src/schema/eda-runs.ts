import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const edaRunsTable = pgTable("eda_runs", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  platform: text("platform").notNull(),
  payload: jsonb("payload").notNull(),
});
