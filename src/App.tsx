import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef
} from "react";
import useIsMobile from "./hooks/useIsMobile";
import "./styles.css";

// Interface da Questão
interface Question {
  id: number | string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

// Estrutura recursiva do índice
type IndexNode = string | { [key: string]: IndexNode };
type MainIndex = Record<string, IndexNode>;

// --- URL DO ÍNDICE PRINCIPAL ---
const MAIN_INDEX_URL = "https://api.npoint.io/4c6da8279c965af748ca";

// --- CONFIGURAÇÕES DO HISTÓRICO ---
const HISTORY_STORAGE_KEY = "appqt_history_v1";
const HISTORY_VERSION = 1;

// Resultado individual de uma questão
interface HistoryQuestion {
  questionId: number | string;
  position: number;
  selectedAnswer: number | null;
  correctAnswer: number;
  isCorrect: boolean;
}

// Registro completo de uma rodada
interface HistoryRound {
  id: string;
  sessionId: string;
  completedAt: string;
  path: string[];
  subtopic: string;
  roundNumber: number;
  total: number;
  score: number;
  wrongCount: number;
  percentage: number;
  questions: HistoryQuestion[];
}

// Estrutura do arquivo de histórico
interface HistoryFile {
  version: number;
  exportedAt: string;
  rounds: HistoryRound[];
}

// Mensagens relacionadas ao histórico
interface HistoryNotice {
  type: "success" | "error";
  message: string;
}

// --- FUNÇÕES AUXILIARES PARA AS ALTERNATIVAS ---

const OPTION_PREFIX_REGEX = /^[A-Ea-e][\)\.\-]\s/;

const getOptionLetter = (index: number): string => {
  return String.fromCharCode(65 + index);
};

const getOptionText = (option: string): string => {
  return option.replace(OPTION_PREFIX_REGEX, "");
};

const formatQuizOption = (option: string, index: number): string => {
  if (OPTION_PREFIX_REGEX.test(option)) {
    return option;
  }

  return `${getOptionLetter(index)}) ${option}`;
};

// --- FUNÇÕES AUXILIARES DE DATA E IDENTIFICAÇÃO ---

const createSessionId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
};

const getRoundCode = (roundNumber: number): string => {
  return `R${String(roundNumber).padStart(2, "0")}`;
};

const getRoundLabel = (roundNumber: number): string => {
  return roundNumber === 0
    ? `${getRoundCode(roundNumber)} — Quiz completo`
    : `${getRoundCode(roundNumber)} — Revisão ${roundNumber}`;
};

const formatDateTime = (isoDate: string): string => {
  const date = new Date(isoDate);

  const formattedDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const formattedTime = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return `${formattedDate} às ${formattedTime}`;
};

const getFileDateTime = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
};

const sanitizeFileName = (text: string): string => {
  const sanitized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);

  return sanitized || "Quiz";
};

const getPdfFileName = (round: HistoryRound): string => {
  const dateTime = getFileDateTime(new Date(round.completedAt));
  const subject = sanitizeFileName(round.subtopic);
  const roundCode = getRoundCode(round.roundNumber);

  return (
    `${dateTime}_${subject}_${roundCode}_` +
    `${round.score}de${round.total}_${round.percentage}pct`
  );
};

// --- FUNÇÕES AUXILIARES DO HISTÓRICO ---

const isRecord = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
};

const isNonNegativeInteger = (
  value: unknown
): value is number => {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
};

const isHistoryQuestion = (
  value: unknown
): value is HistoryQuestion => {
  if (!isRecord(value)) return false;

  const validId =
    typeof value.questionId === "string" ||
    (
      typeof value.questionId === "number" &&
      Number.isFinite(value.questionId)
    );

  const validSelectedAnswer =
    value.selectedAnswer === null ||
    isNonNegativeInteger(value.selectedAnswer);

  return (
    validId &&
    isNonNegativeInteger(value.position) &&
    value.position > 0 &&
    validSelectedAnswer &&
    isNonNegativeInteger(value.correctAnswer) &&
    typeof value.isCorrect === "boolean" &&
    value.isCorrect === (
      value.selectedAnswer === value.correctAnswer
    )
  );
};

const isHistoryRound = (
  value: unknown
): value is HistoryRound => {
  if (!isRecord(value)) return false;

  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.sessionId !== "string" ||
    !value.sessionId ||
    typeof value.completedAt !== "string" ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !Array.isArray(value.path) ||
    !value.path.every(
      (part: unknown) => typeof part === "string"
    ) ||
    typeof value.subtopic !== "string" ||
    !isNonNegativeInteger(value.roundNumber) ||
    !isNonNegativeInteger(value.total) ||
    !isNonNegativeInteger(value.score) ||
    !isNonNegativeInteger(value.wrongCount) ||
    !isNonNegativeInteger(value.percentage) ||
    !Array.isArray(value.questions) ||
    !value.questions.every(isHistoryQuestion)
  ) {
    return false;
  }

  const roundQuestions = value.questions;

  if (
    !roundQuestions.every(
      (question, index) => question.position === index + 1
    )
  ) {
    return false;
  }

  const calculatedTotal = roundQuestions.length;

  const calculatedScore = roundQuestions.filter(
    (question) => question.isCorrect
  ).length;

  const calculatedWrongCount =
    calculatedTotal - calculatedScore;

  const calculatedPercentage =
    calculatedTotal > 0
      ? Math.round(
          (calculatedScore / calculatedTotal) * 100
        )
      : 0;

  return (
    calculatedTotal > 0 &&
    value.total === calculatedTotal &&
    value.score === calculatedScore &&
    value.wrongCount === calculatedWrongCount &&
    value.percentage === calculatedPercentage
  );
};

// Validação do histórico importado ou armazenado
const parseHistory = (text: string): HistoryRound[] => {
  const data: unknown = JSON.parse(text);

  if (
    !isRecord(data) ||
    data.version !== HISTORY_VERSION ||
    !Array.isArray(data.rounds) ||
    !data.rounds.every(isHistoryRound)
  ) {
    throw new Error(
      "O arquivo não possui um formato de histórico compatível."
    );
  }

  return data.rounds;
};

// Combina históricos, preservando os registros já existentes.
// O ID de cada rodada impede duplicação na importação.
const mergeHistory = (
  existing: HistoryRound[],
  incoming: HistoryRound[]
): HistoryRound[] => {
  const records = new Map<string, HistoryRound>();

  for (const round of existing) {
    if (!records.has(round.id)) {
      records.set(round.id, round);
    }
  }

  for (const round of incoming) {
    if (!records.has(round.id)) {
      records.set(round.id, round);
    }
  }

  return Array.from(records.values()).sort(
    (a, b) =>
      Date.parse(a.completedAt) -
      Date.parse(b.completedAt)
  );
};

// Lê o histórico armazenado no navegador
const readStoredHistory = (): HistoryRound[] => {
  const stored = localStorage.getItem(HISTORY_STORAGE_KEY);

  if (!stored) return [];

  return parseHistory(stored);
};

// Grava o histórico no navegador
const writeStoredHistory = (
  rounds: HistoryRound[]
): void => {
  const historyFile: HistoryFile = {
    version: HISTORY_VERSION,
    exportedAt: new Date().toISOString(),
    rounds
  };

  localStorage.setItem(
    HISTORY_STORAGE_KEY,
    JSON.stringify(historyFile)
  );
};

// Constrói o registro de uma rodada concluída
const createHistoryRound = ({
  sessionId,
  roundNumber,
  path,
  subtopic,
  questions,
  answers
}: {
  sessionId: string;
  roundNumber: number;
  path: string[];
  subtopic: string;
  questions: Question[];
  answers: (number | null)[];
}): HistoryRound => {
  const questionResults: HistoryQuestion[] =
    questions.map((question, index) => {
      const selectedAnswer = answers[index] ?? null;

      return {
        questionId: question.id,
        position: index + 1,
        selectedAnswer,
        correctAnswer: question.correct,
        isCorrect:
          selectedAnswer === question.correct
      };
    });

  const total = questionResults.length;

  const score = questionResults.filter(
    (question) => question.isCorrect
  ).length;

  return {
    id: `${sessionId}:${roundNumber}`,
    sessionId,
    completedAt: new Date().toISOString(),
    path: [...path],
    subtopic,
    roundNumber,
    total,
    score,
    wrongCount: total - score,
    percentage:
      total > 0
        ? Math.round((score / total) * 100)
        : 0,
    questions: questionResults
  };
};

// Faz o download de um arquivo JSON
const downloadHistoryFile = (
  rounds: HistoryRound[]
): void => {
  const historyFile: HistoryFile = {
    version: HISTORY_VERSION,
    exportedAt: new Date().toISOString(),
    rounds
  };

  const blob = new Blob(
    [JSON.stringify(historyFile, null, 2)],
    {
      type: "application/json;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download =
    `Historico_AppQT_${getFileDateTime(new Date())}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

// --- COMPONENTE DE OPÇÃO DE RESPOSTA ---

const AnswerOption = React.memo(({
  option,
  isSelected,
  isCorrect,
  disabled,
  onClick,
  fontSizeClass
}: {
  option: string;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  disabled: boolean;
  onClick: () => void;
  fontSizeClass: string;
}) => {
  const buttonStateClass = isSelected
    ? isCorrect
      ? "button-selected-correct"
      : "button-selected-incorrect"
    : "button";

  return (
    <button
      onClick={onClick}
      className={`button ${fontSizeClass} ${buttonStateClass} ${
        disabled ? "cursor-not-allowed" : ""
      }`}
      disabled={disabled}
    >
      {option}
    </button>
  );
});

const getFontSizeClass = (
  textLength: number,
  isMobile: boolean
): string => {
  if (isMobile) {
    if (textLength <= 100) return "button-large";
    if (textLength <= 200) return "button-medium";
    return "button-small";
  } else {
    if (textLength <= 200) return "button-large";
    if (textLength <= 400) return "button-medium";
    return "button-small";
  }
};

const getOptionFontSize = (
  option: string,
  isMobile: boolean
): string => {
  const optionLength = option.length;

  if (isMobile) {
    if (optionLength <= 50) return "button-large";
    if (optionLength <= 100) return "button-medium";
    return "button-small";
  } else {
    if (optionLength <= 80) return "button-large";
    if (optionLength <= 160) return "button-medium";
    return "button-small";
  }
};

// --- COMPONENTE DE MENSAGEM DO HISTÓRICO ---

const HistoryMessage = ({
  notice
}: {
  notice: HistoryNotice;
}) => (
  <div
    className={`history-message history-message--${notice.type}`}
    role={notice.type === "error" ? "alert" : "status"}
  >
    {notice.message}
  </div>
);

// --- TELAS DE NAVEGAÇÃO ---

const MainScreen = ({
  mainIndex,
  onSelectNode,
  isMobile,
  onExportHistory,
  onImportHistory,
  historyNotice
}: {
  mainIndex: MainIndex;
  onSelectNode: (
    key: string,
    value: IndexNode
  ) => void;
  isMobile: boolean;
  onExportHistory: () => void;
  onImportHistory: (file: File) => void;
  historyNotice: HistoryNotice | null;
}) => {
  const importInputRef =
    useRef<HTMLInputElement>(null);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      // Permite selecionar novamente o mesmo arquivo.
      event.target.value = "";

      if (file) {
        onImportHistory(file);
      }
    },
    [onImportHistory]
  );

  return (
    <div className="container">
      <h1 className="title">Escolha a Opção:</h1>

      <p className="mb-4 text-gray-500">
        Você está usando um{" "}
        {isMobile
          ? "telefone celular"
          : "computador/notebook"}
      </p>

      <div className="space-y-3">
        {Object.entries(mainIndex).map(([key, value]) => (
          <button
            key={key}
            onClick={() => onSelectNode(key, value)}
            className="button button-large w-full text-left"
          >
            {key}
          </button>
        ))}
      </div>

      {/* Gerenciamento do histórico */}
      <section className="history-tools">
        <h2 className="history-tools-title">
          Histórico de desempenho
        </h2>

        <p className="history-tools-description">
          Os resultados das rodadas concluídas são
          registrados automaticamente neste navegador.
        </p>

        <div className="history-tools-actions">
          <button
            type="button"
            onClick={onExportHistory}
            className="history-button"
          >
            ↓ Exportar histórico (JSON)
          </button>

          <button
            type="button"
            onClick={handleImportClick}
            className="history-button"
          >
            ↑ Importar histórico (JSON)
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            hidden
          />
        </div>

        <p className="history-tools-hint">
          Exporte periodicamente o histórico para manter
          uma cópia de segurança ou transferi-lo para outro
          dispositivo.
        </p>

        {historyNotice && (
          <HistoryMessage notice={historyNotice} />
        )}
      </section>
    </div>
  );
};

const SubjectScreen = ({
  nodeData,
  path,
  onSelectNode,
  onBack
}: {
  nodeData: Record<string, IndexNode>;
  path: string[];
  onSelectNode: (
    key: string,
    value: IndexNode
  ) => void;
  onBack: () => void;
  isMobile: boolean;
}) => {
  const backLabel =
    path.length <= 1
      ? "\u2190 Voltar para Matérias"
      : `\u2190 Voltar para ${path[path.length - 2]}`;

  return (
    <div className="container">
      <button
        onClick={onBack}
        className="button button-small mb-4"
      >
        {backLabel}
      </button>

      <h1 className="title">Escolha o Assunto:</h1>

      <h2 className="text-xl text-gray-600 mb-4">
        {path.join(" \u203A ")}
      </h2>

      <div className="space-y-3">
        {Object.entries(nodeData).map(([key, value]) => {
          const isEmptyUrl =
            typeof value === "string" &&
            !value.trim();

          return (
            <button
              key={key}
              onClick={() => onSelectNode(key, value)}
              className={`button button-large w-full text-left ${
                isEmptyUrl ? "opacity-60" : ""
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const LoadingScreen = ({
  error
}: {
  error?: string;
}) => (
  <div className="container">
    <h1 className="title">
      {error ? "Erro ao carregar" : "Carregando..."}
    </h1>

    {error && (
      <p className="text-red-500">{error}</p>
    )}
  </div>
);

// --- COMPONENTES DA FOLHA DE RESPOSTAS ---

const ScoreAnswerBlock = ({
  answerIndex,
  options,
  kind
}: {
  answerIndex: number | null;
  options: string[];
  kind: "wrong" | "correct";
}) => {
  const label =
    kind === "wrong" ? "Sua resposta" : "Gabarito";

  const option =
    answerIndex !== null
      ? options[answerIndex]
      : null;

  return (
    <div className={`score-answer score-answer--${kind}`}>
      <h4 className="score-answer-label">
        {label}
      </h4>

      <div className="score-answer-content">
        {answerIndex === null ? (
          <span className="score-unanswered">
            Sem resposta
          </span>
        ) : (
          <>
            <span className="score-answer-letter">
              {getOptionLetter(answerIndex)}
            </span>

            <span className="score-answer-text">
              {typeof option === "string"
                ? getOptionText(option)
                : "Alternativa indisponível"}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

// --- TELA FINAL: FOLHA DE RESPOSTAS ---

const ScoreScreen = ({
  questions,
  answers,
  subtopic,
  round,
  historyNotice,
  onRetryWrong,
  onRestart
}: {
  questions: Question[];
  answers: (number | null)[];
  subtopic: string;
  round: HistoryRound;
  historyNotice: HistoryNotice | null;
  onRetryWrong: () => void;
  onRestart: () => void;
}) => {
  const total = questions.length;

  // Mantém a posição original de cada questão na rodada.
  const results = useMemo(() => {
    return questions.map((question, index) => {
      const answer = answers[index] ?? null;

      return {
        question,
        index,
        answer,
        isCorrect: answer === question.correct
      };
    });
  }, [questions, answers]);

  // Apenas as questões erradas, na ordem original.
  const wrongResults = useMemo(() => {
    return results.filter(
      (result) => !result.isCorrect
    );
  }, [results]);

  const wrongCount = wrongResults.length;
  const score = total - wrongCount;

  const percentage =
    total > 0
      ? Math.round((score / total) * 100)
      : 0;

  // Navegação interna para o cartão da questão errada.
  const handleScrollToQuestion = useCallback(
    (index: number) => {
      const element = document.getElementById(
        `score-question-${index}`
      );

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    },
    []
  );

  // Impressão nativa do navegador.
  // O título temporário sugere o nome do arquivo PDF.
  const handlePrintPdf = useCallback(() => {
    const originalTitle = document.title;

    document.title = getPdfFileName(round);

    try {
      window.print();
    } finally {
      document.title = originalTitle;
    }
  }, [round]);

  return (
    <div className="score-page">
      <div className="score-container">

        {/* Cabeçalho de totalização */}
        <header className="score-summary-card">
          <div className="score-summary-header">
            <div className="score-summary-info">
              <p className="score-eyebrow">
                Quiz completo
              </p>

              <h1 className="score-title">
                {subtopic}
              </h1>

              {/* Disciplina, data e identificação da rodada */}
              <div className="score-metadata">
                {round.path.length > 0 && (
                  <p className="score-subject-path">
                    {round.path.join(" \u203A ")}
                  </p>
                )}

                <p className="score-completion-date">
                  {formatDateTime(round.completedAt)}
                </p>

                <p className="score-round-label">
                  {getRoundLabel(round.roundNumber)}
                </p>
              </div>

              <p className="score-summary-description">
                Você acertou <strong>{score}</strong> de{" "}
                <strong>{total}</strong> questões
                {" "}({percentage}%)
              </p>
            </div>

            <div
              className="score-total"
              aria-hidden="true"
            >
              <span className="score-total-correct">
                {score}
              </span>

              <span className="score-total-all">
                /{total}
              </span>
            </div>
          </div>

          {/* Legenda dos indicadores */}
          <div className="score-legend">
            <span className="score-legend-correct">
              <span aria-hidden="true">✓</span>{" "}
              {score} certas
            </span>

            <span className="score-legend-wrong">
              <span aria-hidden="true">✕</span>{" "}
              {wrongCount} erradas
            </span>
          </div>

          {/* Chips numerados */}
          <div
            className="score-chips"
            role="group"
            aria-label="Folha de respostas"
          >
            {results.map(
              ({ question, index, isCorrect }) => {
                const questionNumber = index + 1;
                const key = `${question.id}-${index}`;

                if (isCorrect) {
                  return (
                    <span
                      key={key}
                      className="score-chip score-chip--correct"
                      role="img"
                      aria-label={`Questão ${questionNumber}: correta`}
                      title={`Questão ${questionNumber}: correta`}
                    >
                      <span className="score-chip-result">
                        <span>{questionNumber}</span>
                        <span aria-hidden="true">✓</span>
                      </span>

                      <span className="score-chip-id">
                        {question.id}
                      </span>
                    </span>
                  );
                }

                return (
                  <button
                    key={key}
                    type="button"
                    className="score-chip score-chip--wrong"
                    onClick={() =>
                      handleScrollToQuestion(index)
                    }
                    aria-label={`Questão ${questionNumber}: errada. Ir para o gabarito comentado.`}
                    title={`Ver gabarito comentado da questão ${questionNumber}`}
                  >
                    <span className="score-chip-result">
                      <span>{questionNumber}</span>
                      <span aria-hidden="true">✕</span>
                    </span>

                    <span className="score-chip-id">
                      {question.id}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </header>

        {/* Aviso caso o histórico não possa ser salvo */}
        {historyNotice?.type === "error" && (
          <div className="score-history-notice">
            <HistoryMessage notice={historyNotice} />
          </div>
        )}

        {/* Detalhamento exclusivo das questões erradas */}
        {wrongCount > 0 ? (
          <section
            className="score-wrong-section"
            aria-labelledby="score-wrong-section-title"
          >
            <h2
              id="score-wrong-section-title"
              className="score-section-title"
            >
              Questões que você errou ({wrongCount})
            </h2>

            <p className="score-section-description">
              Revise suas respostas e os respectivos
              gabaritos comentados.
            </p>

            <div className="score-wrong-list">
              {wrongResults.map(
                ({ question, index, answer }) => (
                  <article
                    key={`${question.id}-${index}`}
                    id={`score-question-${index}`}
                    className="score-question-card"
                  >
                    {/* Identificação da questão */}
                    <div className="score-question-header">
                      <h3 className="score-question-number">
                        Questão {index + 1}
                      </h3>

                      <span className="score-error-badge">
                        <span aria-hidden="true">✕</span>{" "}
                        Errou
                      </span>

                      <span className="score-question-id">
                        ID: {question.id}
                      </span>
                    </div>

                    {/* Enunciado completo */}
                    <p className="score-question-text">
                      {question.question}
                    </p>

                    {/* Alternativa marcada pelo usuário */}
                    <ScoreAnswerBlock
                      answerIndex={answer}
                      options={question.options}
                      kind="wrong"
                    />

                    {/* Alternativa correta */}
                    <ScoreAnswerBlock
                      answerIndex={question.correct}
                      options={question.options}
                      kind="correct"
                    />

                    {/* Gabarito comentado sempre visível */}
                    <div className="score-comment">
                      <h4 className="score-comment-label">
                        Gabarito comentado
                      </h4>

                      <p className="score-comment-text">
                        {question.explanation}
                      </p>
                    </div>
                  </article>
                )
              )}
            </div>
          </section>
        ) : (
          <section className="score-perfect-card">
            <span
              className="score-perfect-icon"
              aria-hidden="true"
            >
              ✓
            </span>

            <div>
              <h2 className="score-perfect-title">
                Parabéns!
              </h2>

              <p className="score-perfect-text">
                Você acertou todas as questões desta rodada.
              </p>
            </div>
          </section>
        )}

        {/* Botões de encerramento, revisão e PDF */}
        <footer className="score-actions">
          {wrongCount > 0 && (
            <button
              type="button"
              onClick={onRetryWrong}
              className="score-action-button score-action-button--primary"
            >
              Refazer só as erradas ({wrongCount})
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintPdf}
            className="score-action-button score-action-button--secondary"
          >
            Salvar em PDF
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="score-action-button score-action-button--secondary"
          >
            Recomeçar Quiz
          </button>
        </footer>

      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---

type ViewState =
  | "loadingIndex"
  | "main"
  | "subject"
  | "loadingQuiz"
  | "quiz"
  | "score"
  | "error";

const AppQT: React.FC = () => {
  const isMobile = useIsMobile(768);

  // Estados de Navegação
  const [currentView, setCurrentView] =
    useState<ViewState>("loadingIndex");

  const [mainIndex, setMainIndex] =
    useState<MainIndex | null>(null);

  const [path, setPath] =
    useState<string[]>([]);

  const [selectedSubTopic, setSelectedSubTopic] =
    useState<string | null>(null);

  const [selectedQuizUrl, setSelectedQuizUrl] =
    useState<string | null>(null);

  // Estados do Quiz
  const [questions, setQuestions] =
    useState<Question[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const [currentQuestion, setCurrentQuestion] =
    useState(0);

  const [showExplanation, setShowExplanation] =
    useState(false);

  const [selectedAnswer, setSelectedAnswer] =
    useState<number | null>(null);

  // Respostas registradas na rodada atual
  const [answers, setAnswers] =
    useState<(number | null)[]>([]);

  // Identifica se a rodada atual é uma revisão
  const [isRetryRound, setIsRetryRound] =
    useState(false);

  // Identifica uma sessão de quiz e suas revisões
  const [sessionId, setSessionId] =
    useState("");

  // R00 = original; R01, R02 = revisões sucessivas
  const [roundNumber, setRoundNumber] =
    useState(0);

  // Registro da última rodada concluída
  const [completedRound, setCompletedRound] =
    useState<HistoryRound | null>(null);

  // Mensagens relacionadas ao armazenamento do histórico
  const [historyNotice, setHistoryNotice] =
    useState<HistoryNotice | null>(null);

  // Cópia em memória dos registros da sessão.
  // Permite exportação mesmo se o localStorage falhar.
  const historyBuffer =
    useRef<HistoryRound[]>([]);

  // Resolve o nó atual da árvore conforme o caminho navegado
  const currentNode = useMemo<IndexNode | null>(() => {
    if (!mainIndex) return null;

    let node: IndexNode = mainIndex;

    for (const key of path) {
      if (
        typeof node === "object" &&
        node !== null &&
        key in node
      ) {
        node = node[key];
      } else {
        return null;
      }
    }

    return node;
  }, [mainIndex, path]);

  // --- HANDLERS DO HISTÓRICO ---

  // Persiste o histórico, sem descartar registros anteriores.
  const saveHistoryRounds = useCallback(
    (newRounds: HistoryRound[]): boolean => {
      const pendingHistory = mergeHistory(
        historyBuffer.current,
        newRounds
      );

      historyBuffer.current = pendingHistory;

      try {
        const storedHistory = readStoredHistory();

        const mergedHistory = mergeHistory(
          storedHistory,
          pendingHistory
        );

        historyBuffer.current = mergedHistory;

        writeStoredHistory(mergedHistory);

        return true;
      } catch (err) {
        console.error(
          "Erro ao salvar o histórico:",
          err
        );

        return false;
      }
    },
    []
  );

  // Exporta todo o histórico em um único arquivo JSON.
  const handleExportHistory = useCallback(() => {
    let rounds = historyBuffer.current;
    let partialExport = false;

    try {
      rounds = mergeHistory(
        readStoredHistory(),
        rounds
      );

      historyBuffer.current = rounds;
    } catch (err) {
      console.error(
        "Erro ao ler o histórico:",
        err
      );

      partialExport = true;
    }

    if (rounds.length === 0) {
      setHistoryNotice({
        type: "error",
        message: partialExport
          ? "Não foi possível acessar o histórico armazenado."
          : "Ainda não existem rodadas concluídas para exportar."
      });

      return;
    }

    try {
      downloadHistoryFile(rounds);

      if (partialExport) {
        setHistoryNotice({
          type: "error",
          message:
            `Exportação parcial: ${rounds.length} registro(s) ` +
            "em memória. Não foi possível acessar o histórico " +
            "armazenado no navegador."
        });
      } else {
        setHistoryNotice({
          type: "success",
          message:
            `Exportação iniciada: ${rounds.length} ` +
            "rodada(s) no arquivo JSON."
        });
      }
    } catch (err) {
      console.error(
        "Erro ao exportar o histórico:",
        err
      );

      setHistoryNotice({
        type: "error",
        message:
          "Não foi possível exportar o histórico."
      });
    }
  }, []);

  // Importa um arquivo JSON e combina com os registros existentes.
  const handleImportHistory = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();

        const importedRounds = parseHistory(text);

        if (importedRounds.length === 0) {
          setHistoryNotice({
            type: "error",
            message:
              "O arquivo selecionado não contém registros."
          });

          return;
        }

        const uniqueImportedRounds = mergeHistory(
          [],
          importedRounds
        );

        const saved = saveHistoryRounds(
          uniqueImportedRounds
        );

        if (saved) {
          setHistoryNotice({
            type: "success",
            message:
              "Histórico importado com sucesso. " +
              "Registros repetidos foram ignorados. " +
              `Total armazenado: ${historyBuffer.current.length} ` +
              "rodada(s)."
          });
        } else {
          setHistoryNotice({
            type: "error",
            message:
              "Os registros foram importados para a memória, " +
              "mas não foi possível salvá-los no navegador. " +
              "Exporte o histórico antes de fechar a página."
          });
        }
      } catch (err) {
        console.error(
          "Erro ao importar o histórico:",
          err
        );

        setHistoryNotice({
          type: "error",
          message:
            err instanceof Error
              ? `Falha na importação: ${err.message}`
              : "Não foi possível importar o arquivo."
        });
      }
    },
    [saveHistoryRounds]
  );

  // --- EFEITOS ---

  // Efeito 1: Carregar o índice principal
  useEffect(() => {
    const fetchMainIndex = async () => {
      try {
        const response = await fetch(MAIN_INDEX_URL);

        if (!response.ok) {
          throw new Error(
            `Falha ao carregar o índice de matérias (${response.status})`
          );
        }

        const data = await response.json();

        if (
          typeof data !== "object" ||
          data === null ||
          Array.isArray(data)
        ) {
          throw new Error(
            "Formato do índice de matérias inválido"
          );
        }

        setMainIndex(data);
        setCurrentView("main");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Erro desconhecido"
        );

        setCurrentView("error");
      }
    };

    fetchMainIndex();
  }, []);

  // Efeito 2: Carregar questões quando uma URL for selecionada.
  // A dependência permanece exclusivamente selectedQuizUrl.
  // A revisão das erradas não dispara este efeito.
  useEffect(() => {
    if (!selectedQuizUrl) return;

    const fetchQuestions = async () => {
      try {
        setError(null);
        setQuestions([]);
        setAnswers([]);
        setIsRetryRound(false);
        setCurrentQuestion(0);
        setSelectedAnswer(null);
        setShowExplanation(false);
        setRoundNumber(0);
        setCompletedRound(null);

        const response = await fetch(selectedQuizUrl);

        if (!response.ok) {
          throw new Error(
            `Erro ao carregar as questões (${response.status})`
          );
        }

        const contentType =
          response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          throw new Error(
            `A URL configurada não retornou JSON válido (${selectedQuizUrl}).`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "O formato dos dados não é um array"
          );
        }

        const validatedQuestions = data.map(
          (q, index) => {
            if (
              !q ||
              (
                typeof q.id !== "number" &&
                typeof q.id !== "string"
              ) ||
              typeof q.question !== "string" ||
              !Array.isArray(q.options) ||
              typeof q.correct !== "number" ||
              typeof q.explanation !== "string"
            ) {
              throw new Error(
                `Questão #${index + 1} tem formato inválido`
              );
            }

            return q as Question;
          }
        );

        if (validatedQuestions.length > 0) {
          setQuestions(validatedQuestions);
          setCurrentView("quiz");
        } else {
          throw new Error(
            "Nenhuma questão encontrada neste tópico."
          );
        }
      } catch (err) {
        console.error("Erro:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Erro desconhecido"
        );

        setCurrentView("error");
      }
    };

    fetchQuestions();
  }, [selectedQuizUrl]);

  // Efeito 3: Posicionar a tela no topo ao exibir o resultado
  // ou iniciar uma rodada de revisão.
  useEffect(() => {
    if (
      currentView === "score" ||
      (currentView === "quiz" && isRetryRound)
    ) {
      window.scrollTo({
        top: 0,
        behavior: "auto"
      });
    }
  }, [currentView, isRetryRound]);

  // --- HANDLERS DE NAVEGAÇÃO ---

  const handleNodeSelect = useCallback(
    (key: string, value: IndexNode) => {
      if (typeof value === "string") {
        if (!value.trim()) {
          setError(
            `O bloco "${key}" ainda não possui URL configurada.`
          );

          setCurrentView("error");
          return;
        }

        // Cada novo quiz completo inicia uma nova sessão.
        setSessionId(createSessionId());
        setRoundNumber(0);
        setCompletedRound(null);

        setSelectedSubTopic(key);
        setSelectedQuizUrl(value);
        setCurrentView("loadingQuiz");
      } else if (
        typeof value === "object" &&
        value !== null
      ) {
        setPath((prev) => [...prev, key]);
        setCurrentView("subject");
      }
    },
    []
  );

  const handleBackStep = useCallback(() => {
    setError(null);

    if (path.length <= 1) {
      setPath([]);
      setCurrentView("main");
    } else {
      setPath((prev) => prev.slice(0, -1));
      setCurrentView("subject");
    }
  }, [path.length]);

  const handleBackFromQuiz = useCallback(() => {
    setQuestions([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setAnswers([]);
    setIsRetryRound(false);
    setSessionId("");
    setRoundNumber(0);
    setCompletedRound(null);
    setError(null);

    setCurrentView(
      path.length > 0 ? "subject" : "main"
    );
  }, [path.length]);

  const handleBackFromError = useCallback(() => {
    setQuestions([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setAnswers([]);
    setIsRetryRound(false);
    setSessionId("");
    setRoundNumber(0);
    setCompletedRound(null);
    setError(null);

    if (path.length > 0) {
      setCurrentView("subject");
    } else {
      setCurrentView("main");
    }
  }, [path.length]);

  // --- HANDLERS DO QUIZ ---

  const handleAnswerClick = useCallback(
    (selectedIndex: number) => {
      if (selectedAnswer !== null) return;

      setSelectedAnswer(selectedIndex);
      setShowExplanation(true);

      // Registra a resposta sem modificar o array anterior.
      setAnswers((prev) => {
        const updatedAnswers = [...prev];

        updatedAnswers[currentQuestion] =
          selectedIndex;

        return updatedAnswers;
      });
    },
    [currentQuestion, selectedAnswer]
  );

  const handleNextQuestion = useCallback(() => {
    if (!questions.length) return;

    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      // Impede o registro repetido da mesma rodada.
      if (completedRound) return;

      // Registra data, horário e resultado ao concluir.
      const round = createHistoryRound({
        sessionId,
        roundNumber,
        path,
        subtopic: selectedSubTopic || "Quiz",
        questions,
        answers
      });

      setCompletedRound(round);

      // Registro automático, independente da geração do PDF.
      const saved = saveHistoryRounds([round]);

      if (saved) {
        setHistoryNotice(null);
      } else {
        setHistoryNotice({
          type: "error",
          message:
            "Não foi possível salvar o histórico no navegador. " +
            "O resultado foi mantido em memória. Exporte o " +
            "histórico pelo menu principal antes de fechar a página."
        });
      }

      setCurrentView("score");
    }
  }, [
    currentQuestion,
    questions,
    answers,
    sessionId,
    roundNumber,
    path,
    selectedSubTopic,
    completedRound,
    saveHistoryRounds
  ]);

  // Inicia uma nova rodada contendo apenas as questões erradas.
  const handleRetryWrong = useCallback(() => {
    const wrongQuestions = questions.filter(
      (question, index) =>
        answers[index] !== question.correct
    );

    if (wrongQuestions.length === 0) return;

    // Preserva a ordem das questões.
    setQuestions(wrongQuestions);

    // Reinicia os estados da rodada.
    setCurrentQuestion(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setIsRetryRound(true);
    setCompletedRound(null);
    setError(null);

    // Incrementa a identificação da rodada.
    setRoundNumber((prev) => prev + 1);

    // Mantém sessionId, selectedSubTopic, selectedQuizUrl e path.
    // Nenhuma nova requisição é realizada.
    setCurrentView("quiz");
  }, [questions, answers]);

  const restartQuiz = useCallback(() => {
    setCurrentView("main");
    setQuestions([]);
    setPath([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setAnswers([]);
    setIsRetryRound(false);
    setSessionId("");
    setRoundNumber(0);
    setCompletedRound(null);
    setError(null);

    // O histórico permanece armazenado.
    // A cópia em memória também é preservada.
  }, []);

  // --- LÓGICA DE RENDERIZAÇÃO ---

  if (currentView === "loadingIndex") {
    return <LoadingScreen />;
  }

  if (currentView === "error") {
    return (
      <>
        <LoadingScreen
          error={error || "Erro desconhecido"}
        />

        <div className="container text-center space-x-3">
          {path.length > 0 && (
            <button
              onClick={handleBackFromError}
              className="button button-large mt-4"
            >
              Voltar
            </button>
          )}

          <button
            onClick={restartQuiz}
            className="button button-large mt-4"
          >
            Voltar ao Início
          </button>
        </div>
      </>
    );
  }

  if (currentView === "main" && mainIndex) {
    return (
      <MainScreen
        mainIndex={mainIndex}
        onSelectNode={handleNodeSelect}
        isMobile={isMobile}
        onExportHistory={handleExportHistory}
        onImportHistory={handleImportHistory}
        historyNotice={historyNotice}
      />
    );
  }

  if (
    currentView === "subject" &&
    currentNode &&
    typeof currentNode === "object"
  ) {
    return (
      <SubjectScreen
        nodeData={currentNode}
        path={path}
        onSelectNode={handleNodeSelect}
        onBack={handleBackStep}
        isMobile={isMobile}
      />
    );
  }

  if (currentView === "score" && completedRound) {
    return (
      <ScoreScreen
        questions={questions}
        answers={answers}
        subtopic={selectedSubTopic || "Quiz"}
        round={completedRound}
        historyNotice={historyNotice}
        onRetryWrong={handleRetryWrong}
        onRestart={restartQuiz}
      />
    );
  }

  if (currentView === "loadingQuiz") {
    return <LoadingScreen />;
  }

  if (currentView === "quiz") {
    if (!questions.length) {
      return (
        <LoadingScreen
          error="Nenhuma questão encontrada"
        />
      );
    }

    const currentQuestionData =
      questions[currentQuestion];

    if (!currentQuestionData) {
      return (
        <LoadingScreen
          error="Questão não encontrada"
        />
      );
    }

    const questionFontSize = getFontSizeClass(
      currentQuestionData.question.length,
      isMobile
    );

    return (
      <div className="container">
        <div className="flex justify-between items-center mb-2">
          <button
            onClick={handleBackFromQuiz}
            className="button button-small"
          >
            &larr; Voltar
          </button>

          <span className="quiz-round-counter button-medium text-gray-500">
            <span>
              Questão {currentQuestion + 1} de{" "}
              {questions.length}
            </span>

            {isRetryRound && (
              <span className="quiz-retry-badge">
                Revisão das erradas — R
                {String(roundNumber).padStart(2, "0")}
              </span>
            )}
          </span>
        </div>

        <h1 className="title text-center">
          Quiz: {selectedSubTopic}
        </h1>

        <div className={isMobile ? "" : "quiz-layout"}>
          <div className="question-area">
            <h2 className={`mb-4 ${questionFontSize}`}>
              {currentQuestionData.question}
            </h2>

            {showExplanation && (
              <div className="mt-4">
                <p className="explanation">
                  {currentQuestionData.explanation}
                </p>
              </div>
            )}

            {showExplanation && (
              <button
                onClick={handleNextQuestion}
                className="button button-large mt-4"
              >
                {currentQuestion === questions.length - 1
                  ? "Ver Resultado"
                  : "Próxima Questão"}
              </button>
            )}
          </div>

          <div className="options-area space-y-3">
            {currentQuestionData.options.map(
              (option, index) => {
                const isSelected =
                  selectedAnswer === index;

                const isCorrect =
                  index === currentQuestionData.correct;

                const optionFontSize =
                  getOptionFontSize(option, isMobile);

                return (
                  <AnswerOption
                    key={index}
                    option={formatQuizOption(option, index)}
                    index={index}
                    isSelected={isSelected}
                    isCorrect={isCorrect}
                    disabled={selectedAnswer !== null}
                    onClick={() => handleAnswerClick(index)}
                    fontSizeClass={optionFontSize}
                  />
                );
              }
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <LoadingScreen
      error="Estado inválido do aplicativo"
    />
  );
};

export default AppQT;
