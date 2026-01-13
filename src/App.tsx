import React, { useState, useEffect, useCallback } from "react";
import useIsMobile from "./hooks/useIsMobile";
import "./styles.css";

// Interface da Questão (sem mudanças)
interface Question {
  id: number | string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

// --- URL DO ÍNDICE PRINCIPAL ---
// O JSON neste link contém a estrutura.
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

// --- NOVOS COMPONENTES DE TELA ---

// (NOVO) Tela Principal - Nível 1: Matérias
const MainScreen = ({ mainIndex, onSelectSubject, isMobile }: {
  mainIndex: Record<string, Record<string, string>>;
  onSelectSubject: (subject: string) => void;
  isMobile: boolean;
}) => (
  <div className="container">
    <h1 className="title">Escolha a Opção:</h1>
    <p className="mb-4 text-gray-500">Você está usando um {isMobile ? "telefone celular" : "computador/notebook"}</p>
    <div className="space-y-3">
      {Object.keys(mainIndex).map((subject) => (
        <button
          key={subject}
          onClick={() => onSelectSubject(subject)}
          className="button button-large w-full text-left"
        >
          {subject}
        </button>
      ))}
    </div>
  </div>
);

// (ANTIGA StartScreen, agora) Tela de Assuntos - Nível 2: Assuntos
const SubjectScreen = ({ subjectData, subjectName, onSelectSubTopic, onBack, isMobile }: {
  subjectData: Record<string, string>;
  subjectName: string;
  onSelectSubTopic: (subTopic: string, url: string) => void;
  onBack: () => void;
  isMobile: boolean; // Mantido para consistência
}) => (
  <div className="container">
    <button onClick={onBack} className="button button-small mb-4">
      &larr; Voltar para Matérias
    </button>
    <h1 className="title">Escolha o Assunto:</h1>
    <h2 className="text-xl text-gray-600 mb-4">{subjectName}</h2>
    <div className="space-y-3">
      {/* Usamos Object.entries para pegar o nome do assunto E a URL */}
      {Object.entries(subjectData).map(([subTopic, url]) => (
        <button
          key={subTopic}
          onClick={() => onSelectSubTopic(subTopic, url)}
          className="button button-large w-full text-left"
        >
          {subTopic}
        </button>
      ))}
    </div>
  </div>
);

// Componente de carregamento (sem mudanças)
const LoadingScreen = ({ error }: { error?: string }) => (
  <div className="container">
    <h1 className="title">
      {error ? "Erro ao carregar" : "Carregando..."}
    </h1>
    {error && <p className="text-red-500">{error}</p>}
  </div>
);

// Componente de resultado final (sem mudanças)
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

// --- COMPONENTE PRINCIPAL ATUALIZADO ---

type ViewState = 'loadingIndex' | 'main' | 'subject' | 'loadingQuiz' | 'quiz' | 'score' | 'error';

// Definindo o tipo para o nosso índice principal
type MainIndex = Record<string, Record<string, string>>;

const AppQT: React.FC = () => {
  const isMobile = useIsMobile(768);

  // Estados de Navegação
  const [currentView, setCurrentView] = useState<ViewState>('loadingIndex');
  const [mainIndex, setMainIndex] = useState<MainIndex | null>(null);
  const [indexLoadTime, setIndexLoadTime] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedSubTopic, setSelectedSubTopic] = useState<string | null>(null);
  const [selectedQuizUrl, setSelectedQuizUrl] = useState<string | null>(null);
  
  // Estados do Quiz
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  // Efeito 1: Carregar o índice principal de matérias
  useEffect(() => {
    const fetchMainIndex = async () => {
      try {
        const response = await fetch(MAIN_INDEX_URL);
        if (!response.ok) throw new Error(`Falha ao carregar o índice de matérias (${response.status})`);
        const data = await response.json();
        
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new Error("Formato do índice de matérias inválido");
        }
        
        setMainIndex(data);
        setCurrentView('main');
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido");
        setCurrentView('error');
      }
    };

    fetchMainIndex();
  }, []); // Roda apenas uma vez

  // Efeito 2: Carregar as questões do quiz quando uma URL for selecionada
  useEffect(() => {
    if (selectedQuizUrl) {
      const fetchQuestions = async () => {
        try {
          // Reset de erro e questões antigas
          setError(null);
          setQuestions([]); 
          
          const response = await fetch(selectedQuizUrl);
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

          if (validatedQuestions.length > 0) {
            setQuestions(validatedQuestions);
            setCurrentView('quiz'); // Mostra o quiz
          } else {
            throw new Error("Nenhuma questão encontrada neste tópico.");
          }
          
        } catch (error) {
          console.error("Erro:", error);
          setError(error instanceof Error ? error.message : "Erro desconhecido");
          setCurrentView('error'); // Mostra tela de erro
        }
      };

      fetchQuestions();
    }
  }, [selectedQuizUrl]); // Roda sempre que a URL do quiz mudar

  // --- Handlers de Navegação ---

  const handleSubjectSelect = useCallback((subject: string) => {
    setSelectedSubject(subject);
    setCurrentView('subject');
  }, []);

  const handleSubTopicSelect = useCallback((subTopic: string, url: string) => {
    setSelectedSubTopic(subTopic);
    setSelectedQuizUrl(url);
    setCurrentView('loadingQuiz'); // Mostra "Carregando..." enquanto busca as questões
  }, []);

  const handleBackToMain = useCallback(() => {
    setCurrentView('main');
    setSelectedSubject(null);
  }, []);

  const handleBackToSubject = useCallback(() => {
    // Limpa estado do quiz atual
    setQuestions([]);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setScore(0);
    setError(null);
    
    // Volta para a tela de assuntos
    setCurrentView('subject');
  }, []);

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
      setCurrentView('score'); // Mudou de setShowScore(true)
    }
  }, [currentQuestion, questions]);

  const restartQuiz = useCallback(() => {
    // Reseta tudo e volta para a tela principal
    setCurrentView('main');
    setQuestions([]);
    setSelectedSubject(null);
    setSelectedSubTopic(null);
    setSelectedQuizUrl(null);
    setCurrentQuestion(0);
    setShowExplanation(false);
    setSelectedAnswer(null);
    setScore(0);
    setError(null);
  }, []);


  // --- LÓGICA DE RENDERIZAÇÃO ---

  // Telas de Carregamento e Erro
  if (currentView === 'loadingIndex') {
    return <LoadingScreen />;
  }
  
  if (currentView === 'error') {
    return (
      <>
        <LoadingScreen error={error || "Erro desconhecido"} />
        <div className="container text-center">
          <button onClick={restartQuiz} className="button button-large mt-4">
            Voltar ao Início
          </button>
        </div>
      </>
    );
  }

  // Tela Principal (Matérias)
  if (currentView === 'main' && mainIndex) {
    return <MainScreen mainIndex={mainIndex} onSelectSubject={handleSubjectSelect} isMobile={isMobile} />;
  }

  // Tela de Assuntos
  if (currentView === 'subject' && mainIndex && selectedSubject) {
    const subjectData = mainIndex[selectedSubject];
    if (!subjectData) {
      // Fallback caso algo dê errado
      setError("Matéria não encontrada.");
      setCurrentView('error');
      return null;
    }
    return (
      <SubjectScreen
        subjectData={subjectData}
        subjectName={selectedSubject}
        onSelectSubTopic={handleSubTopicSelect}
        onBack={handleBackToMain}
        isMobile={isMobile}
      />
    );
  }

  // Tela de Pontuação
  if (currentView === 'score') {
    return <ScoreScreen score={score} total={questions.length} onRestart={restartQuiz} />;
  }

  // Tela de Carregamento do Quiz
  if (currentView === 'loadingQuiz') {
    return <LoadingScreen />;
  }

  // Tela do Quiz
  if (currentView === 'quiz') {
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
        {/* Header do Quiz com botão Voltar */}
        <div className="flex justify-between items-center mb-2">
          <button onClick={handleBackToSubject} className="button button-small">
            &larr; Voltar
          </button>
          <span className="button-medium text-gray-500">
            Questão {currentQuestion + 1} de {questions.length}
          </span>
        </div>
        
        <h1 className="title text-center">Quiz: {selectedSubTopic}</h1>

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
  }

  // Fallback (não deve acontecer)
  return <LoadingScreen error="Estado inválido do aplicativo" />;
};

export default AppQT;
