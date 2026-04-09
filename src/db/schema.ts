import { sql } from 'drizzle-orm';
import { sqliteTable, int, text, integer } from 'drizzle-orm/sqlite-core';

export const block_users_table = sqliteTable('block_users', {
  id: int().primaryKey({ autoIncrement: true }),
  chat_id: integer('chat_id').unique(),
  username: text('username').unique(),
  created_at: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
});
