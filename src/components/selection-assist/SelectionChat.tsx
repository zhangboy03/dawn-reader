import { useEffect, useRef, type FormEvent } from "react";

export type SelectionChatState = "idle" | "loading" | "error";
export type SelectionChatMessage = { role: "user" | "assistant"; content: string };
export type SelectionChatSource = { title: string; url: string };

export function SelectionChatComposer({
  draft,
  messages,
  state,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  messages: SelectionChatMessage[];
  state: SelectionChatState;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return <form className="chat-compose" onSubmit={submit}>
    <textarea
      data-selection-assist-autofocus
      aria-label="向 AI 提问"
      placeholder={messages.length ? "继续提问…" : "输入你想问的问题…"}
      rows={2}
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
    <button type="submit" disabled={!draft.trim() || state === "loading"} aria-label="发送问题">↑</button>
  </form>;
}

export function SelectionChatBody({ messages, state, error, sources, onRetry }: {
  messages: SelectionChatMessage[];
  state: SelectionChatState;
  error: string;
  sources: SelectionChatSource[];
  onRetry: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, state]);

  if (!messages.length && state !== "error") return null;

  return <div className="selection-chat">
    {messages.length > 0 && <div className="chat-thread" aria-live="polite">
      {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
        <small>{message.role === "user" ? "你" : "AI"}</small>
        <p>{message.content}</p>
      </div>)}
      {state === "loading" && <div className="chat-thinking"><i /><span>正在思考…</span></div>}
      {sources.length > 0 && <div className="chat-sources">
        <small>来源</small>
        {sources.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item.url}>[{index + 1}] {item.title}</a>)}
      </div>}
      <div ref={endRef} />
    </div>}
    {state === "error" && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>重试</button></div>}
  </div>;
}
