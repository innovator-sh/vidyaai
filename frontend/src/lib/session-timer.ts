import { SessionTimer, SessionTimerStorage, STORAGE_KEYS, AdaptivePersonaError } from '../types/adaptive-persona';

export class SessionTimerImpl implements SessionTimer {
  startTime: number = Date.now();
  elapsedMinutes: number = 0;
  isActive: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private sessionId: string;
  private onError?: (error: AdaptivePersonaError) => void;

  constructor(onError?: (error: AdaptivePersonaError) => void) {
    this.onError = onError;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now(); // Initialize explicitly
    this.loadFromStorage();
    this.startTimer();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SESSION_TIMER);
      if (stored) {
        const data: SessionTimerStorage = JSON.parse(stored);
        
        // Validate stored data
        if (this.isValidStoredData(data)) {
          this.startTime = data.startTime;
          this.isActive = data.isActive;
          this.sessionId = data.sessionId || this.sessionId;
          this.elapsedMinutes = this.calculateElapsed();
        } else {
          this.handleStorageError('Invalid stored timer data', true);
          this.reset();
        }
      } else {
        this.reset();
      }
    } catch (error) {
      this.handleStorageError('Failed to load timer from storage', true);
      this.reset();
    }
  }

  private isValidStoredData(data: any): data is SessionTimerStorage {
    return (
      data &&
      typeof data.startTime === 'number' &&
      typeof data.isActive === 'boolean' &&
      data.startTime > 0 &&
      data.startTime <= Date.now()
    );
  }

  private saveToStorage(): void {
    try {
      const data: SessionTimerStorage = {
        startTime: this.startTime,
        isActive: this.isActive,
        sessionId: this.sessionId
      };
      localStorage.setItem(STORAGE_KEYS.SESSION_TIMER, JSON.stringify(data));
    } catch (error) {
      this.handleStorageError('Failed to save timer to storage', false);
    }
  }

  private calculateElapsed(): number {
    if (!this.isActive) return 0;
    
    const elapsed = Math.floor((Date.now() - this.startTime) / (1000 * 60));
    
    // Detect unreasonable time jumps (system clock changes)
    if (elapsed < 0 || elapsed > 1440) { // More than 24 hours
      this.handleStorageError('Detected unreasonable time jump', true);
      this.reset();
      return 0;
    }
    
    return elapsed;
  }

  private handleStorageError(message: string, recoverable: boolean): void {
    const error: AdaptivePersonaError = {
      type: 'TIMER_ERROR',
      message,
      timestamp: Date.now(),
      recoverable
    };
    
    console.warn(`[SessionTimer] ${message}`);
    this.onError?.(error);
  }

  reset(): void {
    this.startTime = Date.now();
    this.elapsedMinutes = 0;
    this.isActive = true;
    this.sessionId = this.generateSessionId();
    this.saveToStorage();
  }

  getElapsedTime(): number {
    this.elapsedMinutes = this.calculateElapsed();
    return this.elapsedMinutes;
  }

  pause(): void {
    this.isActive = false;
    this.saveToStorage();
  }

  resume(): void {
    if (!this.isActive) {
      // Adjust start time to account for pause duration
      const pausedDuration = Date.now() - this.startTime - (this.elapsedMinutes * 60 * 1000);
      this.startTime = Date.now() - (this.elapsedMinutes * 60 * 1000);
      this.isActive = true;
      this.saveToStorage();
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  private startTimer(): void {
    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.isActive) {
        const newElapsed = this.calculateElapsed();
        if (newElapsed !== this.elapsedMinutes) {
          this.elapsedMinutes = newElapsed;
        }
      }
    }, 1000); // Update every second
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Static method to check if storage is available
  static isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  // Static method to clear all timer data
  static clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION_TIMER);
    } catch (error) {
      console.warn('[SessionTimer] Failed to clear storage:', error);
    }
  }
}