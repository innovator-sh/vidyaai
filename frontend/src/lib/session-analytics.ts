import { 
  SessionAnalytics, 
  SessionAnalyticsData, 
  PersonaSegment, 
  PersonaSwitchEvent, 
  PersonaType,
  AnalyticsStorage,
  STORAGE_KEYS,
  AdaptivePersonaError
} from '../types/adaptive-persona';

export class SessionAnalyticsImpl {
  private sessionId: string;
  private startTime: number;
  private currentPersona: PersonaType = 'study-buddy';
  private personaStartTime: number;
  private segments: PersonaSegment[] = [];
  private switchEvents: PersonaSwitchEvent[] = [];
  private messageCount: number = 0;
  private onError?: (error: AdaptivePersonaError) => void;

  constructor(sessionId: string, onError?: (error: AdaptivePersonaError) => void) {
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.personaStartTime = this.startTime;
    this.onError = onError;
  }

  recordPersonaSwitch(fromPersona: PersonaType, toPersona: PersonaType, elapsedMinutes: number, automatic: boolean = true): void {
    const now = Date.now();
    
    // Close the current persona segment
    if (this.segments.length > 0 || fromPersona !== 'study-buddy') {
      const segment: PersonaSegment = {
        persona: fromPersona,
        startTime: this.personaStartTime,
        endTime: now,
        duration: Math.floor((now - this.personaStartTime) / (1000 * 60)),
        messageCount: this.getMessagesInTimeRange(this.personaStartTime, now)
      };
      this.segments.push(segment);
    }

    // Record the switch event
    const switchEvent: PersonaSwitchEvent = {
      timestamp: now,
      fromPersona,
      toPersona,
      elapsedMinutes,
      automatic
    };
    this.switchEvents.push(switchEvent);

    // Update current state
    this.currentPersona = toPersona;
    this.personaStartTime = now;

    console.log(`[SessionAnalytics] Recorded persona switch: ${fromPersona} → ${toPersona} (${elapsedMinutes}min)`);
  }

  recordMessage(): void {
    this.messageCount++;
  }

  private getMessagesInTimeRange(startTime: number, endTime: number): number {
    // This is a simplified implementation
    // In a real scenario, you'd track message timestamps
    return Math.floor(this.messageCount / Math.max(1, this.segments.length + 1));
  }

  getCurrentSessionAnalytics(): SessionAnalytics {
    const now = Date.now();
    const totalDuration = Math.floor((now - this.startTime) / (1000 * 60));
    
    // Calculate current persona breakdown including active segment
    const personaBreakdown = this.calculatePersonaBreakdown(now);
    
    return {
      totalDuration,
      personaBreakdown,
      switchCount: this.switchEvents.length,
      sessionId: this.sessionId
    };
  }

  private calculatePersonaBreakdown(currentTime: number): SessionAnalytics['personaBreakdown'] {
    const breakdown = {
      'study-buddy': 0,
      'teacher': 0,
      'mentor': 0
    };

    // Add completed segments
    this.segments.forEach(segment => {
      breakdown[segment.persona] += segment.duration;
    });

    // Add current active segment
    const currentSegmentDuration = Math.floor((currentTime - this.personaStartTime) / (1000 * 60));
    breakdown[this.currentPersona] += currentSegmentDuration;

    return breakdown;
  }

  getDetailedAnalytics(): SessionAnalyticsData {
    const now = Date.now();
    const totalDuration = Math.floor((now - this.startTime) / (1000 * 60));

    // Include current active segment in segments
    const allSegments = [...this.segments];
    if (now > this.personaStartTime) {
      allSegments.push({
        persona: this.currentPersona,
        startTime: this.personaStartTime,
        endTime: now,
        duration: Math.floor((now - this.personaStartTime) / (1000 * 60)),
        messageCount: this.getMessagesInTimeRange(this.personaStartTime, now)
      });
    }

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: now,
      totalDuration,
      personaSegments: allSegments,
      switchEvents: [...this.switchEvents],
      messageCount: this.messageCount
    };
  }

  getSessionSummary(): string {
    const analytics = this.getCurrentSessionAnalytics();
    const { totalDuration, personaBreakdown, switchCount } = analytics;

    if (totalDuration === 0) {
      return "Session just started - no data yet.";
    }

    const formatTime = (minutes: number): string => {
      if (minutes < 60) return `${minutes}min`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}min`;
    };

    const formatPercentage = (minutes: number, total: number): string => {
      if (total === 0) return "0%";
      return `${Math.round((minutes / total) * 100)}%`;
    };

    let summary = `📊 **Session Summary**\n\n`;
    summary += `**Total Duration:** ${formatTime(totalDuration)}\n`;
    summary += `**Persona Switches:** ${switchCount}\n\n`;
    summary += `**Time Distribution:**\n`;
    summary += `• 🧑‍🤝‍🧑 Study Buddy: ${formatTime(personaBreakdown['study-buddy'])} (${formatPercentage(personaBreakdown['study-buddy'], totalDuration)})\n`;
    summary += `• 👩‍🏫 Teacher: ${formatTime(personaBreakdown['teacher'])} (${formatPercentage(personaBreakdown['teacher'], totalDuration)})\n`;
    summary += `• 🧭 Mentor: ${formatTime(personaBreakdown['mentor'])} (${formatPercentage(personaBreakdown['mentor'], totalDuration)})\n`;

    return summary;
  }

  saveToStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ANALYTICS);
      let storage: AnalyticsStorage;

      if (stored) {
        storage = JSON.parse(stored);
      } else {
        storage = {
          sessions: [],
          aggregateStats: {
            totalSessions: 0,
            averageSessionDuration: 0,
            personaPreferences: {
              'study-buddy': 0,
              'teacher': 0,
              'mentor': 0
            },
            lastCleanup: Date.now()
          }
        };
      }

      // Update or add current session
      const sessionData = this.getDetailedAnalytics();
      const existingIndex = storage.sessions.findIndex(s => s.sessionId === this.sessionId);
      
      if (existingIndex >= 0) {
        storage.sessions[existingIndex] = sessionData;
      } else {
        storage.sessions.push(sessionData);
        storage.aggregateStats.totalSessions++;
      }

      // Update aggregate stats
      this.updateAggregateStats(storage);

      // Cleanup old sessions (keep last 30 days)
      this.cleanupOldSessions(storage);

      localStorage.setItem(STORAGE_KEYS.ANALYTICS, JSON.stringify(storage));
    } catch (error) {
      this.handleStorageError('Failed to save analytics to storage');
    }
  }

  private updateAggregateStats(storage: AnalyticsStorage): void {
    if (storage.sessions.length === 0) return;

    // Calculate average session duration
    const totalDuration = storage.sessions.reduce((sum, session) => sum + session.totalDuration, 0);
    storage.aggregateStats.averageSessionDuration = Math.floor(totalDuration / storage.sessions.length);

    // Calculate persona preferences (total time spent with each)
    const personaTotals = {
      'study-buddy': 0,
      'teacher': 0,
      'mentor': 0
    };

    storage.sessions.forEach(session => {
      session.personaSegments.forEach(segment => {
        personaTotals[segment.persona] += segment.duration;
      });
    });

    storage.aggregateStats.personaPreferences = personaTotals;
  }

  private cleanupOldSessions(storage: AnalyticsStorage): void {
    const retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const cutoffTime = Date.now() - retentionPeriod;

    const initialCount = storage.sessions.length;
    storage.sessions = storage.sessions.filter(session => session.startTime > cutoffTime);
    
    if (storage.sessions.length < initialCount) {
      console.log(`[SessionAnalytics] Cleaned up ${initialCount - storage.sessions.length} old sessions`);
      storage.aggregateStats.lastCleanup = Date.now();
    }
  }

  private handleStorageError(message: string): void {
    const error: AdaptivePersonaError = {
      type: 'STORAGE_ERROR',
      message,
      timestamp: Date.now(),
      recoverable: false
    };
    
    console.warn(`[SessionAnalytics] ${message}`);
    this.onError?.(error);
  }

  reset(): void {
    this.startTime = Date.now();
    this.personaStartTime = this.startTime;
    this.currentPersona = 'study-buddy';
    this.segments = [];
    this.switchEvents = [];
    this.messageCount = 0;
  }

  // Static methods for managing stored analytics
  static loadFromStorage(): AnalyticsStorage | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ANALYTICS);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  static clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.ANALYTICS);
    } catch (error) {
      console.warn('[SessionAnalytics] Failed to clear storage:', error);
    }
  }

  static getAggregateStats(): AnalyticsStorage['aggregateStats'] | null {
    const storage = SessionAnalyticsImpl.loadFromStorage();
    return storage?.aggregateStats || null;
  }
}