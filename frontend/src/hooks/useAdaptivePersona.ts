import { useState, useEffect, useRef, useCallback } from 'react';
import { AdaptivePersonaEngine, AdaptivePersonaEngineCallbacks } from '../lib/adaptive-persona-engine';
import { 
  PersonaType, 
  SessionAnalytics, 
  AdaptivePersonaConfig, 
  AdaptivePersonaError 
} from '../types/adaptive-persona';

export interface UseAdaptivePersonaReturn {
  // Current state
  currentPersona: PersonaType;
  elapsedMinutes: number;
  sessionAnalytics: SessionAnalytics | null;
  isActive: boolean;
  
  // Persona information
  personaDisplayInfo: {
    name: string;
    icon: string;
    description: string;
    color: string;
    characteristics: {
      tone: string;
      approach: string;
      bestFor: string;
    };
  };
  
  // Actions
  resetSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  recordMessage: () => void;
  getSystemPrompt: () => string;
  getSessionSummary: () => string;
  forcePersonaSwitch: (persona: PersonaType) => void;
  
  // Configuration
  updateConfiguration: (config: Partial<AdaptivePersonaConfig>) => void;
  
  // Debugging/info
  getSessionState: () => any;
  isPersonaSwitchImminent: () => { imminent: boolean; nextPersona?: PersonaType; minutesUntil?: number };
  
  // Error handling
  lastError: AdaptivePersonaError | null;
  clearError: () => void;
}

export interface UseAdaptivePersonaOptions {
  config?: Partial<AdaptivePersonaConfig>;
  onPersonaSwitch?: (oldPersona: PersonaType, newPersona: PersonaType) => void;
  onError?: (error: AdaptivePersonaError) => void;
  autoStart?: boolean; // Default: true
}

export function useAdaptivePersona(options: UseAdaptivePersonaOptions = {}): UseAdaptivePersonaReturn {
  const { config, onPersonaSwitch, onError, autoStart = true } = options;
  
  // State
  const [currentPersona, setCurrentPersona] = useState<PersonaType>('study-buddy');
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [lastError, setLastError] = useState<AdaptivePersonaError | null>(null);
  const [personaDisplayInfo, setPersonaDisplayInfo] = useState({
    name: 'Study Buddy',
    icon: '🧑‍🤝‍🧑',
    description: 'Friendly and encouraging, perfect for getting started and staying motivated',
    color: '#10B981',
    characteristics: {
      tone: 'Casual and encouraging',
      approach: 'Supportive and motivational',
      bestFor: 'Getting started and staying motivated'
    }
  });
  
  // Engine reference
  const engineRef = useRef<AdaptivePersonaEngine | null>(null);
  const initializingRef = useRef<boolean>(false);
  
  // Callbacks
  const handlePersonaSwitch = useCallback((oldPersona: PersonaType, newPersona: PersonaType) => {
    setCurrentPersona(newPersona);
    if (engineRef.current) {
      setPersonaDisplayInfo(engineRef.current.getPersonaDisplayInfo());
    }
    onPersonaSwitch?.(oldPersona, newPersona);
  }, [onPersonaSwitch]);
  
  const handleTimerUpdate = useCallback((minutes: number) => {
    setElapsedMinutes(minutes);
  }, []);
  
  const handleAnalyticsUpdate = useCallback((analytics: SessionAnalytics) => {
    setSessionAnalytics(analytics);
  }, []);
  
  const handleError = useCallback((error: AdaptivePersonaError) => {
    setLastError(error);
    onError?.(error);
  }, [onError]);
  
  // Initialize engine
  useEffect(() => {
    if (!autoStart || initializingRef.current || engineRef.current) {
      return;
    }
    
    initializingRef.current = true;
    
    try {
      const callbacks: AdaptivePersonaEngineCallbacks = {
        onPersonaSwitch: handlePersonaSwitch,
        onTimerUpdate: handleTimerUpdate,
        onAnalyticsUpdate: handleAnalyticsUpdate,
        onError: handleError
      };
      
      const engine = new AdaptivePersonaEngine(config, callbacks);
      engineRef.current = engine;
      
      // Set initial state
      setCurrentPersona(engine.getCurrentPersona());
      setElapsedMinutes(engine.getElapsedTime());
      setSessionAnalytics(engine.getSessionAnalytics());
      setPersonaDisplayInfo(engine.getPersonaDisplayInfo());
      setIsActive(true);
      
      console.log('[useAdaptivePersona] Engine initialized');
    } catch (error) {
      console.error('[useAdaptivePersona] Failed to initialize engine:', error);
      handleError({
        type: 'API_ERROR',
        message: 'Failed to initialize adaptive persona engine',
        timestamp: Date.now(),
        recoverable: true
      });
    } finally {
      initializingRef.current = false;
    }
  }, [autoStart, config, handlePersonaSwitch, handleTimerUpdate, handleAnalyticsUpdate, handleError]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);
  
  // Action methods
  const resetSession = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.resetSession();
      setCurrentPersona(engineRef.current.getCurrentPersona());
      setElapsedMinutes(0);
      setSessionAnalytics(engineRef.current.getSessionAnalytics());
      setPersonaDisplayInfo(engineRef.current.getPersonaDisplayInfo());
    }
  }, []);
  
  const pauseSession = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.pauseSession();
      setIsActive(false);
    }
  }, []);
  
  const resumeSession = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.resumeSession();
      setIsActive(true);
    }
  }, []);
  
  const recordMessage = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.recordMessage();
      setSessionAnalytics(engineRef.current.getSessionAnalytics());
    }
  }, []);
  
  const getSystemPrompt = useCallback((): string => {
    return engineRef.current?.getSystemPrompt() || '';
  }, []);
  
  const getSessionSummary = useCallback((): string => {
    return engineRef.current?.getSessionSummary() || 'No session data available.';
  }, []);
  
  const forcePersonaSwitch = useCallback((persona: PersonaType) => {
    if (engineRef.current) {
      engineRef.current.forcePersonaSwitch(persona);
      setCurrentPersona(persona);
      setPersonaDisplayInfo(engineRef.current.getPersonaDisplayInfo());
      setSessionAnalytics(engineRef.current.getSessionAnalytics());
    }
  }, []);
  
  const updateConfiguration = useCallback((newConfig: Partial<AdaptivePersonaConfig>) => {
    if (engineRef.current) {
      engineRef.current.updateConfiguration(newConfig);
    }
  }, []);
  
  const getSessionState = useCallback(() => {
    return engineRef.current?.getSessionState() || null;
  }, []);
  
  const isPersonaSwitchImminent = useCallback(() => {
    return engineRef.current?.isPersonaSwitchImminent() || { imminent: false };
  }, []);
  
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);
  
  return {
    // Current state
    currentPersona,
    elapsedMinutes,
    sessionAnalytics,
    isActive,
    personaDisplayInfo,
    
    // Actions
    resetSession,
    pauseSession,
    resumeSession,
    recordMessage,
    getSystemPrompt,
    getSessionSummary,
    forcePersonaSwitch,
    
    // Configuration
    updateConfiguration,
    
    // Debugging/info
    getSessionState,
    isPersonaSwitchImminent,
    
    // Error handling
    lastError,
    clearError
  };
}

// Additional hooks for specific use cases

export function useSessionTimer() {
  const { elapsedMinutes, isActive, resetSession, pauseSession, resumeSession } = useAdaptivePersona();
  
  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };
  
  return {
    elapsedMinutes,
    formattedTime: formatTime(elapsedMinutes),
    isActive,
    resetSession,
    pauseSession,
    resumeSession
  };
}

export function usePersonaManager() {
  const { 
    currentPersona, 
    personaDisplayInfo, 
    forcePersonaSwitch, 
    getSystemPrompt,
    isPersonaSwitchImminent 
  } = useAdaptivePersona();
  
  return {
    currentPersona,
    personaDisplayInfo,
    forcePersonaSwitch,
    getSystemPrompt,
    isPersonaSwitchImminent
  };
}

export function useSessionAnalytics() {
  const { sessionAnalytics, getSessionSummary, recordMessage } = useAdaptivePersona();
  
  return {
    sessionAnalytics,
    getSessionSummary,
    recordMessage
  };
}