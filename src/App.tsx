import React, { useState, useEffect, useCallback, useMemo } from "react";
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

// Estrutura recursiva do índice: cada chave leva a uma URL (string) ou a outro subnível
type IndexNode = string | { [key: string]: IndexNode };
type MainIndex = Record<string, IndexNode>;

// --- URL DO ÍNDICE PRINCIPAL ---
const MAIN_INDEX_URL = "https://api.npoint.io/4c6da8279c965af748ca";

// Componente separado para uma opção de resposta
const AnswerOption = React.memo(({
  option,
  index,
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

const getFontSizeClass = (textLength: number, isMobile: boolean): string => {
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

const getOptionFontSize = (option: string, isMobile: boolean): string => {
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

// --- TELAS DE NAVEGAÇÃO ---

const MainScreen = ({
  mainIndex,
  onSelectNode,
  isMobile
}: {
  mainIndex: MainIndex;
  onSelectNode: (key: string, value: IndexNode) => void;
  isMobile: boolean;
}) => (
  <div className="container">
    <h1 className="title">Escolha a Opção:</h1>
    <p className="mb-4 text-gray-500">
      Você está usando um {isMobile ? "telefone celular" : "computador/notebook"}
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
  </div>
);

const SubjectScreen = ({
  nodeData,
  path,
  onSelectNode,
  onBack,
  isMobile
}: {
  nodeData: Record<string, IndexNode>;
  path: string[];
  onSelectNode: (key: string, value: IndexNode) => void;
  onBack: () => void;
  isMobile: boolean;
}) => {
  const backLabel =
    path.length <= 1
      ? "\u2190 Voltar para Matérias"
      : `\u2190 Voltar para ${path[path.length - 2]}`;

  return (
    <div className="container">
      <button onClick={onBack} className="button button-small mb-4">
        {backLabel}
      </button>
      <h1 className="title">Escolha o Assunto:</h1>
      <h2 className="text-xl text-gray-600 mb-4">{path.join(" \u203A ")}</h2>
      <div className="space-y-3">
        {Object.entries(nodeData).map(([key, value]) => {
          const isEmptyUrl = typeof value === "string" && !value.trim();
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

const LoadingScreen = ({ error }: { error?: string }) => (
  <div className="container">
    <h1 className="title">{error ? "Erro ao carregar" : "Carregando..."}</h1>
    {error && <p className="text-red-500">{error}</p>}
  </div>
);

const ScoreScreen = ({
  score,
  total,
  onRestart
}: {
  score: number;
  total: number;
  onRestart: () => void;
}) => (
  <div className="container">
    <h1 className="title">Quiz Completo!</h1>
    <p className="mb-4">
      Você acertou {score} de {total} questões
    </p>
    <button onClick={onRestart} className="button button-large">
      Recomeçar Quiz
    </button>
  </div>
);

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
  const [currentView, setCurrentView] = useState<ViewState>("loadingIndex");
  const [mainIndex, setMainIndex] = useState<MainIndex | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [selectedSubTopic, setSelectedSubTopic] = useState<string | null>(null);
  const [selectedQuizUrl, setSelectedQuizUrl] = useState<string | null>(null);

  // Estados do Quiz
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  // Resolve o nó atual da árvore conforme o caminho navegado
  const currentNode = useMemo<IndexNode | null>(() => {
    if (!mainIndex) return null;
    let node: IndexNode = mainIndex;
    for (const key of path) {
      if (typeof node === "object" && node !== null && key in node) {
        node = node[key];
      } else {
        return null;
      }
    }
    return node;
  }, [mainIndex, path]);

  // Efeito 1: Carregar o índice principal
  useEffect(() => {
    const fetchMainIndex = async () => {
      try {
        const response = await fetch(MAIN_INDEX_URL);
        if (!response.ok) {
          throw new Error(`Falha ao carregar o índice de matérias (${response.status})`);
        }
        const data = await response.json();

        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          throw new Error("Formato do índice de matérias inválido");
        }

        setMainIndex(data);
        setCurrentView("main");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido");
        setCurrentView("error");
      }
    };

    fetchMainIndex();
  }, []);

  // Efeito 2: Carregar as questões quando uma URL final for selecionada
  useEffect(() => {
    if (!selectedQuizUrl) return;

    const fetchQuestions = async () => {
      try {
        setError(null);
        setQuestions([]);

        const response = await fetch(selectedQuizUrl);
        if (!response.ok) {
          throw new Error(`Erro ao carregar as questões (${response.status})`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`A URL configurada não retornou JSON válido (${selectedQuizUrl}).`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("O formato dos dados não é um array");
        }

        const validatedQuestions = data.map((q, index) => {
          if (
            !q ||
            (typeof q.id !== "number" && typeof q.id !== "string") ||
            typeof q.question !== "string" ||
            !Array.isArray(q.options) ||
            typeof q.correct !== "number" ||
            typeof q.explanation !== "string"
          ) {
            throw new Error(`Questão #${index + 1} tem formato inválido`);
          }
          return q as Question;
        });

        if (validatedQuestions.length > 0) {
          setQuestions(validatedQuestions);
          setCurrentView("quiz");
        } else {
          throw new Error("Nenhuma questão encontrada neste tópico.");
        }
      } catch (err) {
        console.error("Erro:", err);
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setCurrentView("error");
      }
    };

    fetchQuestions();
  }, [selectedQuizUrl]);

  // --- Handlers de Navegação ---

  const handleNodeSelect = useCallback((key: string, value: IndexNode) => {
    if (typeof value === "string") {
      if (!value.trim()) {
        setError(`O bloco "${key}" ainda não possui URL configurada.`);
        setCurrentView("error");
        return;
      }
      setSelectedSubTopic(key);
      setSelectedQuizUrl(value);
      setCurrentView("loadingQuiz");
    } else if (typeof value === "object" && value !== null) {
      setPath((prev) => [...prev, key]);
      setCurrentView("subject");
    }
  }, []);

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
    setScore(0);
    setError(null);

    setCurrentView(path.length > 0 ? "subject" : "main");
  }, [path.length]);

  const handleBackFromError = useCallback(() => {
    setQuestions([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setError(null);

    if (path.length > 0) {
      setCurrentView("subject");
    } else {
      setCurrentView("main");
    }
  }, [path.length]);

  // --- Handlers do Quiz ---

  const handleAnswerClick = useCallback(
    (selectedIndex: number) => {
      setSelectedAnswer(selectedIndex);
      setShowExplanation(true);

      const currentQuestionData = questions[currentQuestion];
      if (currentQuestionData?.correct === selectedIndex) {
        setScore((prev) => prev + 1);
      }
    },
    [currentQuestion, questions]
  );

  const handleNextQuestion = useCallback(() => {
    if (!questions.length) return;

    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setCurrentView("score");
    }
  }, [currentQuestion, questions]);

  const restartQuiz = useCallback(() => {
    setCurrentView("main");
    setQuestions([]);
    setPath([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setScore(0);
    setError(null);
  }, []);

  // --- LÓGICA DE RENDERIZAÇÃO ---

  if (currentView === "loadingIndex") {
    return <LoadingScreen />;
  }

  if (currentView === "error") {
    return (
      <>
        <LoadingScreen error={error || "Erro desconhecido"} />
        <div className="container text-center space-x-3">
          {path.length > 0 && (
            <button onClick={handleBackFromError} className="button button-large mt-4">
              Voltar
            </button>
          )}
          <button onClick={restartQuiz} className="button button-large mt-4">
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
      />
    );
  }

  if (currentView === "subject" && currentNode && typeof currentNode === "object") {
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

  if (currentView === "score") {
    return (
      <ScoreScreen
        score={score}
        total={questions.length}
        onRestart={restartQuiz}
      />
    );
  }

  if (currentView === "loadingQuiz") {
    return <LoadingScreen />;
  }

  if (currentView === "quiz") {
    if (!questions.length) {
      return <LoadingScreen error="Nenhuma questão encontrada" />;
    }

    const currentQuestionData = questions[currentQuestion];
    if (!currentQuestionData) {
      return <LoadingScreen error="Questão não encontrada" />;
    }

    const questionFontSize = getFontSizeClass(
      currentQuestionData.question.length,
      isMobile
    );

    return (
      <div className="container">
        <div className="flex justify-between items-center mb-2">
          <button onClick={handleBackFromQuiz} className="button button-small">
            &larr; Voltar
          </button>
          <span className="button-medium text-gray-500">
            Questão {currentQuestion + 1} de {questions.length}
          </span>
        </div>

        <h1 className="title text-center">Quiz: {selectedSubTopic}</h1>

        <div className={isMobile ? "" : "quiz-layout"}>
          <div className="question-area">
            <h2 className={`mb-4 ${questionFontSize}`}>
              {currentQuestionData.question}
            </h2>

            {showExplanation && (
              <div className="mt-4">
                <p className="explanation">{currentQuestionData.explanation}</p>
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
            {currentQuestionData.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = index === currentQuestionData.correct;
              const optionFontSize = getOptionFontSize(option, isMobile);

              return (
                <AnswerOption
                  key={index}
                  option={option}
                  index={index}
                  isSelected={isSelected}
                  isCorrect={isCorrect}
                  disabled={selectedAnswer !== null}
                  onClick={() => handleAnswerClick(index)}
                  fontSizeClass={optionFontSize}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return <LoadingScreen error="Estado inválido do aplicativo" />;
};

export default AppQT;
