// Core types and interfaces for the Adaptive Persona Engine

export type PersonaType = 'study-buddy' | 'teacher' | 'mentor';

// Session timing interface
export interface SessionTimer {
  startTime: number;
  elapsedMinutes: number;
  isActive: boolean;
  reset(): void;
  getElapsedTime(): number;
}

// Persona switching configuration
export interface PersonaThresholds {
  studyBuddyStart: number;    // 0
  teacherStart: number;       // 10
  studyBuddyReturn: number;   // 28
  teacherReturn: number;      // 32
  mentorStart: number;        // 40
}

// Analytics data structure
export interface SessionAnalytics {
  totalDuration: number;
  personaBreakdown: {
    'study-buddy': number;
    'teacher': number;
    'mentor': number;
  };
  switchCount: number;
  sessionId: string;
}

// Detailed analytics data model
export interface SessionAnalyticsData {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalDuration: number;
  personaSegments: PersonaSegment[];
  switchEvents: PersonaSwitchEvent[];
  messageCount: number;
  userSatisfaction?: number;
}

export interface PersonaSegment {
  persona: PersonaType;
  startTime: number;
  endTime: number;
  duration: number;
  messageCount: number;
}

export interface PersonaSwitchEvent {
  timestamp: number;
  fromPersona: PersonaType;
  toPersona: PersonaType;
  elapsedMinutes: number;
  automatic: boolean;
}

// Adaptive engine interface
export interface AdaptiveEngine {
  getCurrentPersona(): PersonaType;
  shouldSwitchPersona(elapsedMinutes: number): boolean;
  getNextPersona(elapsedMinutes: number): PersonaType;
  updateConfiguration(thresholds: PersonaThresholds): void;
}

// Persona manager interface
export interface PersonaManager {
  currentPersona: PersonaType;
  switchPersona(newPersona: PersonaType): void;
  getSystemPrompt(): string;
  onPersonaSwitch?: (oldPersona: PersonaType, newPersona: PersonaType) => void;
}

// Configuration file structure
export interface AdaptivePersonaConfig {
  version: string;
  thresholds: PersonaThresholds;
  analytics: {
    enabled: boolean;
    retentionDays: number;
  };
  ui: {
    showTimer: boolean;
    showPersonaIndicator: boolean;
    enableTransitionAnimations: boolean;
  };
}

// Local storage schemas
export interface SessionTimerStorage {
  startTime: number;
  isActive: boolean;
  sessionId: string;
}

export interface AnalyticsStorage {
  sessions: SessionAnalyticsData[];
  aggregateStats: {
    totalSessions: number;
    averageSessionDuration: number;
    personaPreferences: Record<PersonaType, number>;
    lastCleanup: number;
  };
}

// Error handling types
export interface AdaptivePersonaError {
  type: 'TIMER_ERROR' | 'STORAGE_ERROR' | 'CONFIG_ERROR' | 'API_ERROR';
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Utility types
export type PersonaTransitionCallback = (oldPersona: PersonaType, newPersona: PersonaType) => void;
export type TimerUpdateCallback = (elapsedMinutes: number) => void;
export type AnalyticsUpdateCallback = (analytics: SessionAnalytics) => void;

// Default configuration
export const DEFAULT_CONFIG: AdaptivePersonaConfig = {
  version: "1.0.0",
  thresholds: {
    studyBuddyStart: 0,
    teacherStart: 10,
    studyBuddyReturn: 28,
    teacherReturn: 32,
    mentorStart: 40
  },
  analytics: {
    enabled: true,
    retentionDays: 30
  },
  ui: {
    showTimer: true,
    showPersonaIndicator: true,
    enableTransitionAnimations: true
  }
};

// Storage keys
export const STORAGE_KEYS = {
  SESSION_TIMER: 'vidyaai_session_timer',
  ANALYTICS: 'vidyaai_session_analytics',
  CONFIG: 'vidyaai_adaptive_config'
} as const;