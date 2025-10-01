import React, { useState, useEffect, useCallback, useMemo } from "react";
import useIsMobile from "./hooks/useIsMobile";
import "./styles.css";

interface Question {
  id: number | string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

// Updated discipline URLs with 12 disciplines
const DISCIPLINE_URLS = {
  "LodJerj_RegInt_NormasCGJ": "https://api.npoint.io/3bbe2d34838a59690d3a",
  "DirProcPen_FGV_2022a2025_ago": "https://api.npoint.io/2c152b014f18efa4b839",
  "DirProcPen_AçaoPenal-Renuncia": "https://api.npoint.io/b6a4a71f953732984397",
  "Direito Adm. Compilado TJs": "https://api.npoint.io/d21d3b62969820d8a28b",
  "FGV_2021aSet2025_EqvLog_e_NegProposicoes": "https://api.npoint.io/4e49d3ff24cbef2e59f8",
  "FGV_DPP_Procedimentos": "https://api.npoint.io/fe09fb0d17bd375dab30",
  "Est_Sentença e Recursos": "https://api.npoint.io/e46eb88f71c646e2d0c9",
  "Est_DirCiv-Contratos-S1": "https://api.npoint.io/a4287ab01660bf62ccba",
  "Português FGV 2025": "https://api.npoint.io/2f4aafb421c2f68dffa4",
  "Botão 10": "https://api.npoint.io/d4409edb551a34f98119",
  "TI": "https://api.npoint.io/placeholder7"
};

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

// Função atualizada para definir tamanhos de fonte mais adequados
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

// Nova função para determinar o tamanho da fonte para opções de resposta
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

// Componente de tela inicial atualizado com 12 disciplinas
const StartScreen = ({ onSelectDiscipline, isMobile }: { onSelectDiscipline: (discipline: string) => void, isMobile: boolean }) => (
  <div className="container">
    <h1 className="title">Escolha a disciplina:</h1>
    <p className="mb-4 text-gray-500">Você está usando um {isMobile ? "telefone celular" : "computador/notebook"}</p>
    <div className="space-y-3">
      {Object.keys(DISCIPLINE_URLS).map((discipline) => (
        <button
          key={discipline}
          onClick={() => onSelectDiscipline(discipline)}
          className="button button-large w-full text-left"
        >
          {discipline}
        </button>
      ))}
    </div>
  </div>
);

// Componente de carregamento
const LoadingScreen = ({ error }: { error?: string }) => (
  <div className="container">
    <h1 className="title">
      {error ? "Erro ao carregar questões" : "Carregando questões..."}
    </h1>
    {error && <p className="text-red-500">{error}</p>}
  </div>
);

// Componente de resultado final
const ScoreScreen = ({ score, total, onRestart }: { score: number, total: number, onRestart: () => void }) => (
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

const AppQT: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDiscipline) {
      const fetchQuestions = async () => {
        try {
          setLoading(true);
          setError(null);
          
          const url = DISCIPLINE_URLS[selectedDiscipline as keyof typeof DISCIPLINE_URLS];
          if (!url) {
            throw new Error("Disciplina não encontrada");
          }

          const response = await fetch(url);
          if (!response.ok) throw new Error(`Erro ao carregar as questões (${response.status})`);

          const data = await response.json();

          if (!Array.isArray(data)) {
            throw new Error("O formato dos dados não é um array");
          }
          
          const validatedQuestions = data.map((q, index) => {
            if (!q || 
                (typeof q.id !== 'number' && typeof q.id !== 'string') || 
                typeof q.question !== 'string' || 
                !Array.isArray(q.options) || 
                typeof q.correct !== 'number' || 
                typeof q.explanation !== 'string') {
              throw new Error(`Questão #${index + 1} tem formato inválido`);
            }
            return q as Question;
          });

          setQuestions(validatedQuestions);
        } catch (error) {
          console.error("Erro:", error);
          setError(error instanceof Error ? error.message : "Erro desconhecido");
        } finally {
          setLoading(false);
        }
      };

      fetchQuestions();
    }
  }, [selectedDiscipline]);

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
      setShowScore(true);
    }
  }, [currentQuestion, questions]);

  const restartQuiz = useCallback(() => {
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setScore(0);
    setShowScore(false);
    setShowStartScreen(true);
    setSelectedDiscipline(null);
    setQuestions([]);
  }, []);

  const handleDisciplineSelect = useCallback((discipline: string) => {
    setSelectedDiscipline(discipline);
    setShowStartScreen(false);
  }, []);

  if (showStartScreen) {
    return <StartScreen onSelectDiscipline={handleDisciplineSelect} isMobile={isMobile} />;
  }

  if (loading || error) {
    return <LoadingScreen error={error || undefined} />;
  }

  if (showScore) {
    return <ScoreScreen score={score} total={questions.length} onRestart={restartQuiz} />;
  }

  if (!questions.length) {
    return <LoadingScreen error="Nenhuma questão encontrada" />;
  }

  const currentQuestionData = questions[currentQuestion];
  if (!currentQuestionData) {
    return <LoadingScreen error="Questão não encontrada" />;
  }

  const questionFontSize = getFontSizeClass(currentQuestionData.question.length, isMobile);

  return (
    <div className="container">
      <h1 className="title">Quiz de {selectedDiscipline}</h1>
      <div>
        <span className="button-medium text-gray-500">
          Questão {currentQuestion + 1} de {questions.length}
        </span>
      </div>

      <div className={isMobile ? "" : "quiz-layout"}>
        <div className="question-area">
          <h2 className={`mb-4 ${questionFontSize}`}>{currentQuestionData.question}</h2>
          
          {showExplanation && (
            <div className="mt-4">
              <p className="explanation">{currentQuestionData.explanation}</p>
            </div>
          )}
          
          {showExplanation && (
            <button 
              onClick={handleNextQuestion} 
              className="button button-large mt-4">
              {currentQuestion === questions.length - 1 ? "Ver Resultado" : "Próxima Questão"}
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
};

export default AppQT;
