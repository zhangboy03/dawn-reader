import { useEffect, useRef, type FormEvent } from "react";

export type SelectionChatState = "idle" | "loading" | "error";
export type SelectionChatSource = { title: string; url: string };
export type SelectionChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: SelectionChatSource[];
};

export function SelectionChatComposer({
  draft,
  messages,
  state,
  onDraftChange,
  onSubmit,
  focusOnMount = false,
}: {
  draft: string;
  messages: SelectionChatMessage[];
  state: SelectionChatState;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  focusOnMount?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusOnMount) textareaRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return <form className="chat-compose" onSubmit={submit}>
    <textarea
      ref={textareaRef}
      aria-label="向 AI 提问"
      placeholder={messages.length ? "继续提问…" : "输入你想问的问题…"}
      rows={2}
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
    <button type="submit" disabled={!draft.trim() || state === "loading"}>发送</button>
  </form>;
}

export function SelectionChatBody({ messages, state, error, onRetry }: {
  messages: SelectionChatMessage[];
  state: SelectionChatState;
  error: string;
  onRetry: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = endRef.current?.closest<HTMLElement>("[data-selection-assist-body]");
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, state]);

  if (!messages.length && state !== "error") return null;

  return <div className="selection-chat">
    {messages.length > 0 && <div className="chat-thread" aria-live="polite">
      {messages.map((message, index) => <div
        className={`chat-message ${message.role}`}
        aria-live={message.role === "assistant" && index === messages.length - 1 ? "polite" : undefined}
        key={`${message.role}-${index}`}
      >
        <small>{message.role === "user" ? "问题" : "回答"}</small>
        <p>{message.content}</p>
        {message.role === "assistant" && message.sources && message.sources.length > 0 && <nav className="chat-sources" aria-label="来源">
          <small>来源</small>
          {message.sources.map((item, sourceIndex) => <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url}>[{sourceIndex + 1}] {item.title}</a>)}
        </nav>}
      </div>)}
      {state === "loading" && <div className="chat-thinking" role="status" aria-live="polite"><i /><span>正在回答…</span></div>}
      <div ref={endRef} />
    </div>}
    {state === "error" && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>重试</button></div>}
  </div>;
}
