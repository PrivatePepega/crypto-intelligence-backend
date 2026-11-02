CREATE TABLE IF NOT EXISTS accountstest.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chat_id UUID NOT NULL
        REFERENCES accountstest.chats(id)
        ON DELETE CASCADE,

    role TEXT NOT NULL
        CHECK (role IN ('user', 'assistant')),

    content TEXT NOT NULL,

    sequence_number BIGINT NOT NULL
        CHECK (sequence_number > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chat_messages_sequence
        UNIQUE (chat_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_sequence
    ON accountstest.chat_messages (chat_id, sequence_number);