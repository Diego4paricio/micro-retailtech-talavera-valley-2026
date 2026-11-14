import type { HelpSection } from "@kardo/contracts";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { helpApi } from "../../api/help.js";
import { Icon } from "../../components/Icon.js";
import {
  exitDurations,
  prefersReducedMotion,
} from "../../components/motion.js";
import { NativeDialog } from "../../components/NativeDialog.js";
import { Notice } from "../../components/Notice.js";
import { ApiRequestError, errorMessage, isAbortError } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { openKardoTour } from "../onboarding/HowKardoWorks.js";
import { useOptionalFirstSteps } from "../onboarding/use-first-steps.js";
import { AnswerText } from "./AnswerText.js";
import { helpGuides } from "./guides.js";
import { helpTopics } from "./sections.js";

type Message = { id: number; role: "user" | "assistant"; text: string };
type AskStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const minQuestion = 3;
const maxQuestion = 500;
/** Contract limits: at most 6 turns of at most 2,000 characters each. */
const maxHistoryTurns = 6;
const maxHistoryText = 2_000;

/**
 * Slide-in guide for a section: curated content first (always available),
 * then "Pregúntale a Kardo". Built on a native modal <dialog> for focus
 * trapping, Escape and an inert page behind it.
 */
export function HelpDrawer({
  open,
  section,
  onSectionChange,
  onClose,
}: {
  open: boolean;
  section: HelpSection;
  onSectionChange: (section: HelpSection) => void;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const firstSteps = useOptionalFirstSteps();
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLLIElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const titleId = useId();
  const topicId = useId();
  const questionId = useId();
  const questionHintId = useId();
  const askBodyId = useId();

  const [threads, setThreads] = useState<
    Partial<Record<HelpSection, Message[]>>
  >({});
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<AskStatus>({ kind: "idle" });
  // "Pregúntale a Kardo" stays folded until asked for.
  const [askOpen, setAskOpen] = useState(false);

  const guide = helpGuides[section];
  const thread = threads[section] ?? [];
  const isAsking = status.kind === "loading";
  const showAsk = askOpen || thread.length > 0 || isAsking;
  const trimmed = draft.trim();
  const canAsk =
    !isAsking && trimmed.length >= minQuestion && trimmed.length <= maxQuestion;

  // Leaving the drawer cancels an answer in flight.
  useEffect(() => {
    if (!open) controllerRef.current?.abort();
  }, [open]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  // A new topic starts at the top, with a clean status line; a question
  // still in flight for the previous topic is cancelled.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the topic changes
  useEffect(() => {
    controllerRef.current?.abort();
    scrollRef.current?.scrollTo({ top: 0 });
    setStatus({ kind: "idle" });
    setAskOpen(false);
  }, [section]);

  // Opening the ask block brings it into view and focuses the question.
  useEffect(() => {
    if (!askOpen) return;
    const field = document.getElementById(questionId);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [askOpen, questionId]);

  // Keep the newest message in view.
  const threadLength = thread.length;
  useEffect(() => {
    if (!threadLength && !isAsking) return;
    threadEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [threadLength, isAsking]);

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (
      isAsking ||
      question.length < minQuestion ||
      question.length > maxQuestion
    )
      return;
    const askedSection = section;
    const previous = threads[askedSection] ?? [];
    // Only complete user/assistant pairs are kept, so history always starts
    // with a user turn and alternates.
    const history = previous.slice(-maxHistoryTurns).map((message) => ({
      role: message.role,
      text: message.text.slice(0, maxHistoryText),
    }));
    const userMessage: Message = {
      id: nextId.current++,
      role: "user",
      text: question,
    };
    setThreads((current) => ({
      ...current,
      [askedSection]: [...(current[askedSection] ?? []), userMessage],
    }));
    setDraft("");
    setStatus({ kind: "loading" });

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const rollback = () => {
      setThreads((current) => ({
        ...current,
        [askedSection]: (current[askedSection] ?? []).filter(
          (message) => message.id !== userMessage.id,
        ),
      }));
      setDraft((current) => current || question);
    };

    try {
      const result = await helpApi.ask(
        {
          section: askedSection,
          question,
          ...(history.length ? { history } : {}),
        },
        controller.signal,
      );
      const answer =
        typeof result?.answer === "string" ? result.answer.trim() : "";
      if (!answer)
        throw new ApiRequestError("", 503, "HELP_ASSISTANT_UNAVAILABLE");
      setThreads((current) => ({
        ...current,
        [askedSection]: [
          ...(current[askedSection] ?? []),
          { id: nextId.current++, role: "assistant", text: answer },
        ],
      }));
      setStatus({ kind: "idle" });
    } catch (error) {
      rollback();
      if (controller.signal.aborted || isAbortError(error)) {
        setStatus({ kind: "idle" });
        return;
      }
      if (
        error instanceof ApiRequestError &&
        (error.code === "HELP_ASSISTANT_UNAVAILABLE" || error.status === 503)
      ) {
        setStatus({ kind: "unavailable" });
        return;
      }
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void ask(draft);
    }
  }

  function resetThread() {
    controllerRef.current?.abort();
    setThreads((current) => ({ ...current, [section]: [] }));
    setStatus({ kind: "idle" });
  }

  return (
    <NativeDialog
      aria-labelledby={titleId}
      className="help-drawer"
      exitMs={exitDurations.slow}
      onClose={onClose}
      open={open}
    >
      <div className="help-drawer-panel">
        <header className="help-drawer-header">
          <div className="help-drawer-heading">
            <Icon name="help" size={20} />
            <div>
              <p className="help-drawer-group">Guía · {guide.group}</p>
              <h2 id={titleId}>{guide.title}</h2>
            </div>
          </div>
          <button
            aria-label="Cerrar la guía"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="help-drawer-scroll" ref={scrollRef}>
          {/* Here while Primeros pasos lasts, also after the guide is
                hidden (relevo 31); once finished it does not come back
                (relevo 33). «Cómo funciona Kardo» stays. */}
          <div className="help-start">
            {firstSteps?.isPending ? (
              <button
                className="help-start-link"
                onClick={() => {
                  onClose();
                  navigate({ name: "first-steps" });
                }}
                type="button"
              >
                <Icon name="checklist" size={18} />
                <span>
                  <strong>Primeros pasos</strong>
                  <small>Tu página con QR, paso a paso</small>
                </span>
              </button>
            ) : null}
            <button
              className="help-start-link"
              onClick={() => {
                onClose();
                openKardoTour();
              }}
              type="button"
            >
              <Icon name="compass" size={18} />
              <span>
                <strong>Cómo funciona Kardo</strong>
                <small>Cuatro ideas, un minuto</small>
              </span>
            </button>
          </div>
          <div className="help-topic">
            <label htmlFor={topicId}>Tema</label>
            <select
              id={topicId}
              onChange={(event) =>
                onSectionChange(event.target.value as HelpSection)
              }
              value={section}
            >
              {helpTopics.map((topic) => (
                <option key={topic.section} value={topic.section}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>

          <div className="help-guide" key={section}>
            <section aria-label="Qué es" className="help-block">
              <p className="help-summary">{guide.summary}</p>
              <p className="help-when">
                <strong>Cuándo usarla. </strong>
                {guide.whenToUse}
              </p>
            </section>

            <section
              className="help-block"
              aria-labelledby={`${titleId}-concepts`}
            >
              <h3 id={`${titleId}-concepts`}>Conceptos clave</h3>
              <dl className="help-concepts">
                {guide.concepts.map((concept) => (
                  <div key={concept.term}>
                    <dt>{concept.term}</dt>
                    <dd>{concept.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              className="help-block"
              aria-labelledby={`${titleId}-tasks`}
            >
              <h3 id={`${titleId}-tasks`}>Tareas comunes</h3>
              <div className="help-tasks">
                {guide.tasks.map((task, index) => (
                  <details
                    className="help-task"
                    key={task.title}
                    open={index === 0}
                  >
                    <summary>
                      <span>{task.title}</span>
                      <Icon
                        className="help-task-chevron"
                        name="chevron-down"
                        size={16}
                      />
                    </summary>
                    <ol>
                      {task.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <section className="help-ask" aria-labelledby={`${titleId}-ask`}>
            <div className="help-ask-heading">
              <h3 id={`${titleId}-ask`}>
                <Icon name="sparkles" size={15} />
                Pregúntale a Kardo
              </h3>
              {thread.length ? (
                <button
                  className="link-button"
                  onClick={resetThread}
                  type="button"
                >
                  Nueva conversación
                </button>
              ) : null}
            </div>

            {!showAsk ? (
              <>
                <p className="help-ask-note">
                  ¿No encuentras lo que buscas? Pregunta con tus palabras.
                </p>
                <button
                  aria-controls={askBodyId}
                  aria-expanded="false"
                  className="button button-secondary button-small"
                  onClick={() => setAskOpen(true)}
                  type="button"
                >
                  Preguntar a Kardo
                </button>
              </>
            ) : null}

            <div hidden={!showAsk} id={askBodyId}>
              <p className="help-ask-note">
                Responde con la guía de producto de Kardo. Solo recibe tu
                pregunta y el tema; nunca los datos de tu espacio.
              </p>

              {!thread.length && !isAsking && guide.questions.length ? (
                <ul
                  aria-label="Preguntas sugeridas"
                  className="help-suggestions"
                >
                  {guide.questions.map((question) => (
                    <li key={question}>
                      <button
                        className="help-suggestion"
                        disabled={isAsking}
                        onClick={() => void ask(question)}
                        type="button"
                      >
                        {question}
                        <Icon name="arrow-up-right" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {thread.length || isAsking ? (
                <ol
                  aria-label="Conversación"
                  aria-live="polite"
                  className="help-thread"
                >
                  {thread.map((message) => (
                    <li
                      className={`help-message help-message-${message.role}`}
                      key={message.id}
                    >
                      <span className="help-message-author">
                        {message.role === "user" ? "Tú" : "Kardo"}
                      </span>
                      {message.role === "assistant" ? (
                        <AnswerText text={message.text} />
                      ) : (
                        <p>{message.text}</p>
                      )}
                    </li>
                  ))}
                  {isAsking ? (
                    <li className="help-message help-message-assistant help-message-pending">
                      <span className="help-message-author">Kardo</span>
                      <span className="help-typing" role="status">
                        <span className="visually-hidden">
                          Kardo está preparando una respuesta…
                        </span>
                        <span aria-hidden="true" />
                        <span aria-hidden="true" />
                        <span aria-hidden="true" />
                      </span>
                    </li>
                  ) : null}
                  <li
                    aria-hidden="true"
                    className="help-thread-end"
                    ref={threadEndRef}
                  />
                </ol>
              ) : null}

              {status.kind === "unavailable" ? (
                <Notice
                  onDismiss={() => setStatus({ kind: "idle" })}
                  title="El asistente no está disponible por ahora"
                  tone="info"
                >
                  La guía de esta sección sigue aquí. Vuelve a intentarlo en
                  unos minutos.
                </Notice>
              ) : null}
              {status.kind === "error" ? (
                <Notice
                  onDismiss={() => setStatus({ kind: "idle" })}
                  tone="warning"
                >
                  {status.message}
                </Notice>
              ) : null}

              <form className="help-ask-form" onSubmit={submit}>
                <label className="visually-hidden" htmlFor={questionId}>
                  Tu pregunta sobre {guide.title}
                </label>
                <textarea
                  aria-describedby={questionHintId}
                  id={questionId}
                  maxLength={maxQuestion}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onQuestionKeyDown}
                  placeholder={`Pregunta sobre ${guide.title}…`}
                  readOnly={isAsking}
                  rows={2}
                  value={draft}
                />
                <div className="help-ask-actions">
                  <small className="help-ask-hint" id={questionHintId}>
                    Enter para enviar · Shift + Enter para otra línea ·{" "}
                    <span className="tabular">
                      {draft.length}/{maxQuestion}
                    </span>
                  </small>
                  <button
                    aria-busy={isAsking || undefined}
                    className="button button-primary button-small"
                    disabled={!canAsk}
                    type="submit"
                  >
                    {isAsking ? (
                      <span aria-hidden="true" className="button-spinner" />
                    ) : (
                      <Icon name="send" size={15} />
                    )}
                    Preguntar
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </NativeDialog>
  );
}
