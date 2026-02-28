// Stats Tracker Utility for VidyaAI
// Tracks quiz results and chat sessions in localStorage

export interface QuizResult {
  subject: string;
  topic: string;
  score: number;
  totalQuestions: number;
  timestamp: number;
}

export interface ChatSession {
  subject: string;
  messageCount: number;
  duration: number; // in seconds
  timestamp: number;
}

const QUIZ_RESULTS_KEY = 'vidyaai_quiz_results';
const CHAT_SESSIONS_KEY = 'vidyaai_chat_sessions';

/**
 * Add a quiz result to localStorage
 */
export function addQuizResult(result: Omit<QuizResult, 'timestamp'>): void {
  try {
    const results = getQuizResults();
    const newResult: QuizResult = {
      ...result,
      timestamp: Date.now(),
    };
    results.push(newResult);
    localStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(results));
  } catch (error) {
    console.error('Failed to save quiz result:', error);
  }
}

/**
 * Get all quiz results from localStorage
 */
export function getQuizResults(): QuizResult[] {
  try {
    const data = localStorage.getItem(QUIZ_RESULTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to retrieve quiz results:', error);
    return [];
  }
}

/**
 * Add a chat session to localStorage
 */
export function addChatSession(session: Omit<ChatSession, 'timestamp'>): void {
  try {
    const sessions = getChatSessions();
    const newSession: ChatSession = {
      ...session,
      timestamp: Date.now(),
    };
    sessions.push(newSession);
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save chat session:', error);
  }
}

/**
 * Get all chat sessions from localStorage
 */
export function getChatSessions(): ChatSession[] {
  try {
    const data = localStorage.getItem(CHAT_SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to retrieve chat sessions:', error);
    return [];
  }
}

/**
 * Clear all stats data (for testing or reset purposes)
 */
export function clearAllStats(): void {
  try {
    localStorage.removeItem(QUIZ_RESULTS_KEY);
    localStorage.removeItem(CHAT_SESSIONS_KEY);
  } catch (error) {
    console.error('Failed to clear stats:', error);
  }
}
