CREATE TABLE IF NOT EXISTS accounts.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES accounts.users(id)
        ON DELETE CASCADE,

    session_token_hash TEXT NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON accounts.sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON accounts.sessions (expires_at);