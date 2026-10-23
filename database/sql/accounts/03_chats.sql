CREATE TABLE IF NOT EXISTS accounts.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES accounts.users(id)
        ON DELETE CASCADE,

    title TEXT NOT NULL DEFAULT 'New chat',
    summary TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id_created_at
    ON accounts.chats (user_id, created_at DESC);