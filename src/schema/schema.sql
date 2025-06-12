CREATE TABLE IF NOT EXISTS prevetned_lists (
	id SERIAL PRIMARY KEY,
	chat_id BIGINT,
	username TEXT,
	-- optional fields
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
