# Chatbot Frontend Integration

This is the frontend handoff for the authenticated chatbot API under `/api-v1/chatbot`.

The backend already owns conversation storage, rolling summary, context selection, and agent invocation. The frontend only needs to:

1. Fetch the current chat when the chatbot opens.
2. Send the new user message.
3. Render the returned user and assistant messages.

The backend uses the last two stored messages plus a server-side summary. **Do not send conversation history or summaries from the client.**

---

## 1. Prerequisites

### Authentication

Both chatbot endpoints require a valid database-backed login session.

- Auth is cookie-based.
- The cookie is HttpOnly; frontend JavaScript must not read it.
- Every request must use `credentials: "include"`.
- Do not send an `Authorization` header for chatbot requests.
- If the user is not logged in, the API returns `401`.

The existing auth endpoints are:

```text
POST /api-v1/auth/login
POST /api-v1/auth/signout
GET  /api-v1/authMe
```

The chatbot assumes the user has already completed the normal login flow.

### CORS and origin

`POST /api-v1/chatbot/messages` checks the browser `Origin` against the backend `FRONTEND_URL`.

- The frontend origin must match `FRONTEND_URL`.
- `http://localhost:3000` and `http://127.0.0.1:3000` are different origins.
- `https://example.com` and `https://www.example.com` are different origins.
- Do not set the `Origin` header manually; the browser sets it.
- If a development proxy rewrites requests, preserve the `Origin` header.
- A mismatched origin returns `403`.
- In production, use HTTPS so the `Secure` auth cookie is sent.

### API base URL

Use the same backend base URL that the auth client already uses.

Examples:

```text
Direct backend:  NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
Same-origin proxy: NEXT_PUBLIC_API_BASE_URL=""
```

The full chatbot paths are:

```text
GET  ${API_BASE_URL}/api-v1/chatbot/messages
POST ${API_BASE_URL}/api-v1/chatbot/messages
```

---

## 2. API contract

### 2.1 Fetch the current chat

```http
GET /api-v1/chatbot/messages
GET /api-v1/chatbot/messages?chatId=<uuid>
```

- Without `chatId`, returns the authenticated user's most recently created chat.
- With `chatId`, returns that chat only if it belongs to the authenticated user.
- If the user has no chat and no `chatId` is supplied, returns `200` with `chat: null`.
- If a supplied `chatId` does not exist for that user, returns `404`.

Successful response:

```json
{
  "chat": {
    "id": "uuid",
    "title": "Explain BTC market structure",
    "createdAt": "2026-10-23T12:34:56.789Z"
  },
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Explain BTC market structure",
      "sequenceNumber": 1,
      "createdAt": "2026-10-23T12:34:56.789Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Here is the current structure...",
      "sequenceNumber": 2,
      "createdAt": "2026-10-23T12:35:10.123Z"
    }
  ]
}
```

Empty state:

```json
{
  "chat": null,
  "messages": []
}
```

Notes:

- `messages` is ordered oldest to newest by `sequenceNumber`.
- `role` is always `"user"` or `"assistant"`.
- `sequenceNumber` is a number in the API response.
- `createdAt` is an ISO-8601 string in JSON.
- The backend does not return the internal chat summary.
- The endpoint returns the full message history. There is no pagination yet.

### 2.2 Send a message

```http
POST /api-v1/chatbot/messages
Content-Type: application/json
```

Request body:

```json
{
  "message": "What should I watch for ETH this week?",
  "chatId": "optional uuid"
}
```

Rules:

- `message` is required, trimmed, and must be between 1 and 8,000 characters.
- `chatId` is optional and must be a UUID if supplied.
- Without `chatId`, the backend continues the user's latest chat, or creates a new chat if none exists.
- With `chatId`, the backend uses that chat only if it belongs to the user.
- The first message creates the chat and derives its title from the message.

Successful response:

```json
{
  "chat": {
    "id": "uuid",
    "title": "What should I watch for ETH this week?",
    "createdAt": "2026-10-23T12:40:00.000Z"
  },
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What should I watch for ETH this week?",
      "sequenceNumber": 3,
      "createdAt": "2026-10-23T12:40:00.000Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Watch ETF flows, the ETH/BTC ratio, and...",
      "sequenceNumber": 4,
      "createdAt": "2026-10-23T12:40:22.000Z"
    }
  ]
}
```

The response contains only the two new messages, not the full history.

Important behavior:

- The backend stores the user message **before** running the agent.
- The request does not stream. It resolves only after the agent finishes, which can take a long time.
- If the agent fails after the user message is stored, the endpoint returns `502` and may include the saved `chat` and `userMessage` in the error body.
- If the agent answer is generated but cannot be saved, the endpoint returns `500` and may include the saved `chat` and `userMessage`.
- Do not automatically retry a failed `POST`. The original user message may already be stored.

### 2.3 Error responses

All errors are JSON with a `message` string. Some `500`/`502` errors also include `chat` and/or `userMessage`.

| Status | Meaning | Frontend behavior |
|---|---|---|
| `400` | Invalid request body/query, empty message, message too long, invalid UUID | Show the validation message. The message was not saved. Keep or restore the draft. |
| `401` | Missing, invalid, expired, or revoked session | Send the user to login. Do not retry. |
| `403` | Origin is not the configured `FRONTEND_URL` | Show a configuration error. Do not retry. |
| `404` | Supplied `chatId` is not available to this user | Clear the stale chat ID, then fetch the latest chat or show an empty state. |
| `500` | Database/save failure or server auth configuration failure | Show an error. Refetch to reconcile. Do not auto-resend. |
| `502` | Agent invocation failed or returned no usable answer | Keep `userMessage` if the error body includes it. Show an assistant/error state. Do not auto-resend. |
| Network error / timeout | Request outcome unknown | Refetch to reconcile. The backend may still finish and save the answer. |

Example `502` body:

```json
{
  "message": "The chatbot could not generate a response. Please try again.",
  "chat": {
    "id": "uuid",
    "title": "...",
    "createdAt": "2026-10-23T12:40:00.000Z"
  },
  "userMessage": {
    "id": "uuid",
    "role": "user",
    "content": "What should I watch for ETH this week?",
    "sequenceNumber": 3,
    "createdAt": "2026-10-23T12:40:00.000Z"
  }
}
```

The frontend should display the saved user message and a client-side error/assistant bubble. The error bubble is not stored in the backend; it will disappear on a refetch, while the user message remains.

---

## 3. TypeScript types

```ts
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  sequenceNumber: number;
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
}

export interface GetChatResponse {
  chat: Chat | null;
  messages: ChatMessage[];
}

export interface SendMessageResponse {
  chat: Chat;
  messages: [ChatMessage, ChatMessage];
}

export interface ChatbotErrorBody {
  message: string;
  chat?: Chat;
  userMessage?: ChatMessage;
}
```

The `messages` tuple in `SendMessageResponse` is `[userMessage, assistantMessage]` in normal operation. Prefer sorting by `sequenceNumber` rather than relying on tuple position in UI state.

---

## 4. API client

```ts
// lib/chatbot-api.ts

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ChatbotApiError extends Error {
  readonly status: number;
  readonly body: ChatbotErrorBody | null;

  constructor(status: number, body: ChatbotErrorBody | null) {
    super(body?.message ?? `Chatbot request failed (${status})`);
    this.name = "ChatbotApiError";
    this.status = status;
    this.body = body;
  }
}

async function chatbotRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}/api-v1/chatbot${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | T
    | ChatbotErrorBody
    | null;

  if (!response.ok) {
    throw new ChatbotApiError(response.status, body as ChatbotErrorBody | null);
  }

  return body as T;
}

export function getChat(chatId?: string): Promise<GetChatResponse> {
  const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : "";
  return chatbotRequest<GetChatResponse>(`/messages${query}`);
}

export function sendChatMessage(
  message: string,
  chatId?: string,
): Promise<SendMessageResponse> {
  return chatbotRequest<SendMessageResponse>("/messages", {
    method: "POST",
    body: JSON.stringify({
      message,
      ...(chatId ? { chatId } : {}),
    }),
  });
}
```

Notes:

- Do not add `Content-Type` to a bodyless `GET`; the wrapper only adds it when a body exists.
- Do not set `Origin`; the browser does that.
- Do not cache responses.
- Use the same API base URL as the auth client.
- If the frontend uses a proxy, an empty base URL with relative `/api-v1/...` paths is fine.

---

## 5. React hook example

This hook assumes the chatbot panel is mounted somewhere that survives open/close toggles. If the panel unmounts while a request is running, the backend still finishes and saves the answer; reopening will fetch it.

```tsx
// hooks/use-chatbot.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChatbotApiError,
  getChat,
  sendChatMessage,
  type Chat,
  type ChatMessage,
} from "@/lib/chatbot-api";

export const MAX_CHAT_MESSAGE_LENGTH = 8_000;

export function useChatbot(open: boolean, initialChatId?: string) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const chatIdRef = useRef<string | undefined>(initialChatId);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const result = await getChat(chatIdRef.current);
      setChat(result.chat);
      setMessages(result.messages);
      chatIdRef.current = result.chat?.id;
    } catch (cause) {
      setLoadError(getErrorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const send = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();

      if (!message || isSending) return false;

      if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
        setError(`Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
        return false;
      }

      setError(null);
      setIsSending(true);

      const optimisticId = `temp-${crypto.randomUUID()}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        role: "user",
        content: message,
        sequenceNumber: Number.MAX_SAFE_INTEGER,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticMessage]);

      try {
        const result = await sendChatMessage(message, chatIdRef.current);

        setChat(result.chat);
        chatIdRef.current = result.chat.id;

        setMessages((current) => {
          const withoutOptimistic = current.filter(
            (item) => item.id !== optimisticId,
          );
          const byId = new Map(
            withoutOptimistic.map((item) => [item.id, item]),
          );

          for (const item of result.messages) {
            byId.set(item.id, item);
          }

          return [...byId.values()].sort(
            (a, b) => a.sequenceNumber - b.sequenceNumber,
          );
        });

        return true;
      } catch (cause) {
        const apiError = cause instanceof ChatbotApiError ? cause : null;
        const savedUserMessage = apiError?.body?.userMessage;

        if (savedUserMessage) {
          setMessages((current) => {
            const withoutOptimistic = current.filter(
              (item) => item.id !== optimisticId,
            );
            const exists = withoutOptimistic.some(
              (item) => item.id === savedUserMessage.id,
            );

            return exists
              ? withoutOptimistic
              : [...withoutOptimistic, savedUserMessage];
          });
        } else {
          setMessages((current) =>
            current.filter((item) => item.id !== optimisticId),
          );
        }

        if (apiError?.body?.chat) {
          setChat(apiError.body.chat);
          chatIdRef.current = apiError.body.chat.id;
        }

        if (!apiError) {
          setError("Could not reach the chatbot. Check your connection and refresh.");
          void load();
          return false;
        }

        if (apiError.status === 401) {
          setError("Your session expired. Please sign in again.");
        } else if (apiError.status === 403) {
          setError("This chatbot request was blocked by the API origin check.");
        } else if (apiError.status === 404) {
          setError("That chat no longer exists. Loading your latest chat.");
          chatIdRef.current = undefined;
          setChat(null);
          void load();
        } else if (apiError.status === 400) {
          setError(apiError.message);
        } else {
          setError(apiError.message);

          if (!savedUserMessage) {
            void load();
          }
        }

        return false;
      } finally {
        setIsSending(false);
      }
    },
    [isSending, load],
  );

  return {
    chat,
    messages,
    isLoading,
    isSending,
    error,
    loadError,
    load,
    send,
    clearError: () => setError(null),
  };
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof ChatbotApiError) {
    if (cause.status === 401) return "Please sign in to use the chatbot.";
    if (cause.status === 403) {
      return "The chatbot request was blocked by the API origin check.";
    }
    return cause.message;
  }

  return "Could not load the chatbot. Please try again.";
}
```

### Hook behavior notes

- The first `GET` uses no `chatId`, so the backend returns the latest chat.
- After the first successful send, the returned `chat.id` is used for subsequent sends.
- `initialChatId` is optional and supports a future chat-list UI.
- The optimistic user message is replaced by the server row when the response arrives.
- On `502`/`500` with `userMessage`, the saved user message is kept.
- On `404`, the stale chat ID is cleared and the latest chat is loaded.
- On network failure, the hook refetches to reconcile.
- The hook does not auto-retry a `POST`.
- The hook does not send history or summary.

---

## 6. Minimal panel component

```tsx
// components/chatbot-panel.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import {
  MAX_CHAT_MESSAGE_LENGTH,
  useChatbot,
} from "@/hooks/use-chatbot";

export function ChatbotPanel({ open }: { open: boolean }) {
  const {
    chat,
    messages,
    isLoading,
    isSending,
    error,
    loadError,
    load,
    send,
    clearError,
  } = useChatbot(open);

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  if (!open) return null;

  const submit = async () => {
    const message = input.trim();
    if (!message || isSending) return;

    setInput("");
    await send(message);
  };

  return (
    <aside className="chatbot-panel">
      <header className="chatbot-header">
        <strong>{chat?.title ?? "Market chatbot"}</strong>
      </header>

      <div className="chatbot-messages">
        {isLoading && <p>Loading conversation...</p>}

        {loadError && (
          <div className="chatbot-load-error">
            <p>{loadError}</p>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !loadError && messages.length === 0 && (
          <p className="chatbot-empty">
            Ask about markets, assets, indicators, or macro conditions.
          </p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`chatbot-message chatbot-message-${message.role}`}
          >
            <div className="chatbot-message-role">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            <div
              className="chatbot-message-content"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isSending && <p className="chatbot-pending">Researching...</p>}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="chatbot-error">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <form
        className="chatbot-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          disabled={isSending}
          placeholder={
            isSending
              ? "Waiting for the assistant..."
              : "Ask the market chatbot..."
          }
          rows={3}
        />

        <button type="submit" disabled={isSending || !input.trim()}>
          {isSending ? "Thinking..." : "Send"}
        </button>
      </form>
    </aside>
  );
}
```

---

## 7. UI/state requirements

### Current chat selection

- On open, call `GET /messages` with no `chatId` to load the latest chat.
- Store `chat.id` after the response and use it for subsequent sends.
- Do not maintain a separate chat ID that can diverge from `chat.id`.
- If the user has no chat, show an empty state. The first `POST` creates the chat.
- `POST` without `chatId` continues the latest chat. Pass `chatId` when displaying a specific chat.

### Message state

- Sort by `sequenceNumber` ascending.
- Use `message.id` as the React key.
- Do not assume strict user/assistant alternation. A failed turn can leave a saved user message without an assistant reply.
- On success, replace the optimistic user message with the returned user message and append the assistant message.
- On a `502` with `userMessage`, keep the saved user message and show an error state.
- The assistant error bubble is client-only and is not persisted.

### Sending

- Trim before sending.
- Enforce the 8,000-character limit client-side; the backend enforces it too.
- Disable the send button and Enter-to-send while `isSending`.
- Do not allow concurrent sends in one chat. The backend does not serialize whole agent turns; concurrent requests can interleave messages.
- Clear the composer on submit. If you want to restore the draft on a `400`, keep a copy locally; the backend did not save that message.
- Do not automatically resend a failed message. On `500`/`502`, the user message may already be stored.
- Do not use a short client-side timeout. Agent answers can take minutes. If the hosting layer has a proxy timeout, that may cut off the request while the backend continues; refetch to check.
- The backend does not support cancellation/stop-generation. Hiding the spinner does not stop the agent.

### Loading and refresh

- The request is non-streaming; show a clear "Researching..." or equivalent state.
- If the browser loses the response, call `GET` again later to see whether the assistant message was saved.
- There is no pending/status endpoint. If the last message is `user`, it may be pending or failed. Offer a manual refresh rather than polling forever.
- If the panel unmounts mid-request, the backend still saves the answer. Reopening and fetching will show it.

### Error UX

- `401`: prompt sign-in; do not retry.
- `403`: show an origin/configuration error; do not retry.
- `400`: show validation feedback; the message was not saved.
- `404`: clear the stale chat ID and load the latest chat.
- `500`/`502`: show an error state; refetch to reconcile; do not auto-resend.
- Network error: show a connection error; refetch to reconcile.

---

## 8. Security notes

- Never read or store the auth cookie in frontend JavaScript. It is HttpOnly.
- Do not put the auth token in the request body or an `Authorization` header for chatbot requests.
- Do not set the `Origin` header manually.
- Treat all message content as untrusted.
- Render message content as text, or use a sanitized Markdown renderer.
- Do not use `dangerouslySetInnerHTML` with model or user output unless it has been sanitized.
- If rendering Markdown links, use safe link handling (`rel="noopener noreferrer"`, appropriate `target`).
- Do not send conversation history, summaries, system prompts, or user IDs. The backend loads the user and context from the session and database.
- Use HTTPS in production so the `Secure` auth cookie is sent.
- Consider per-user rate limiting on the backend before heavy public use.

---

## 9. Important backend limitations

These are current backend behaviors, not frontend bugs:

- There is no chat-list endpoint.
- There is no create-new-chat endpoint. `POST` without `chatId` continues the latest chat, or creates the first one.
- There is no rename-chat endpoint.
- There is no delete-chat endpoint.
- There is no message pagination; `GET` returns the full history.
- There is no streaming/SSE; the final answer arrives in one JSON response.
- There is no retry-a-saved-user-message endpoint.
- There is no cancellation/stop-generation endpoint.
- There is no pending/status endpoint.
- The internal summary is not returned to the client.
- The backend stores the user message before invoking the agent, so a failed turn can leave a user-only message.
- A full agent answer can be slow and is subject to external search/model provider quotas.

If the UI needs a "New chat" button, a chat list, pagination, streaming, cancellation, or retry-in-place, those require additional backend endpoints or protocol changes.

---

## 10. Integration checklist

- [ ] Auth cookie is sent with `credentials: "include"`.
- [ ] `API_BASE_URL` matches the backend used by the auth flow.
- [ ] `FRONTEND_URL` on the backend exactly matches the browser origin.
- [ ] `GET /api-v1/chatbot/messages` loads the latest chat on panel open.
- [ ] No chat renders an empty state, not an error.
- [ ] First send omits `chatId`; subsequent sends use the returned `chat.id`.
- [ ] Message list is sorted by `sequenceNumber`.
- [ ] Send is disabled while a request is in flight.
- [ ] Composer enforces the 8,000-character limit.
- [ ] `401` sends the user to login.
- [ ] `403` shows an origin/configuration error.
- [ ] `400` preserves or restores the draft.
- [ ] `404` clears the stale chat ID and reloads the latest chat.
- [ ] `500`/`502` keeps a saved `userMessage` when provided.
- [ ] Failed sends are not automatically retried.
- [ ] Network failures offer a refresh/reconcile path.
- [ ] Long-running requests have a suitable timeout strategy.
- [ ] Message content is rendered as text or sanitized Markdown.
- [ ] Panel reopen refetches the chat so an abandoned request's result appears.
