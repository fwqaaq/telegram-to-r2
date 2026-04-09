import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { block_users_table } from './schema';

export async function is_user_banned(
  db: D1Database,
  chat_id?: number,
  username?: string,
) {
  const d1 = drizzle(db);

  const filters = [];
  if (chat_id) filters.push(eq(block_users_table.chat_id, chat_id));
  if (username)
    filters.push(eq(block_users_table.username, username.toLowerCase()));

  const result = await d1
    .select()
    .from(block_users_table)
    .where(or(...filters))
    .limit(1);

  return result.length > 0;
}

// block user function
export async function block_user(
  db: D1Database,
  params: { chat_id?: number; username?: string },
) {
  const d1 = drizzle(db);
  const { chat_id, username } = params;

  if (!chat_id && !username) {
    throw new Error('必须提供 chat_id 或 username 其中之一');
  }

  // upsert the block record
  return await d1
    .insert(block_users_table)
    .values({
      chat_id,
      username: username?.toLowerCase(),
    })
    .onConflictDoUpdate({
      target: block_users_table.chat_id,
      set: { username: username?.toLowerCase() },
    });
}

// unblock user function
export async function unblock_user(
  db: D1Database,
  identifier: string | number, // can be either chat_id (number) or username (string)
) {
  const d1 = drizzle(db);

  if (typeof identifier === 'number') {
    return await d1
      .delete(block_users_table)
      .where(eq(block_users_table.chat_id, identifier));
  } else {
    return await d1
      .delete(block_users_table)
      .where(eq(block_users_table.username, identifier.toLowerCase()));
  }
}

// list blocked users function
export async function list_blocked_users(db: D1Database) {
  const d1 = drizzle(db);
  return await d1.select().from(block_users_table).all();
}
