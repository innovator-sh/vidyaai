import { 
  AdaptiveEngine, 
  PersonaType, 
  PersonaThresholds, 
  AdaptivePersonaConfig,
  DEFAULT_CONFIG,
  STORAGE_KEYS,
  AdaptivePersonaError 
} from '../types/adaptive-persona';

export class AdaptiveEngineImpl implements AdaptiveEngine {
  private thresholds: PersonaThresholds;
  private currentPersona: PersonaType = 'study-buddy';
  private config: AdaptivePersonaConfig;
  private onError?: (error: AdaptivePersonaError) => void;

  constructor(config?: Partial<AdaptivePersonaConfig>, onError?: (error: AdaptivePersonaError) => void) {
    this.onError = onError;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.thresholds = this.config.thresholds;
    this.validateThresholds();
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (stored) {
        const storedConfig: AdaptivePersonaConfig = JSON.parse(stored);
        if (this.isValidConfig(storedConfig)) {
          this.config = { ...this.config, ...storedConfig };
          this.thresholds = this.config.thresholds;
          this.validateThresholds();
        } else {
          this.handleConfigError('Invalid stored configuration', true);
        }
      }
    } catch (error) {
      this.handleConfigError('Failed to load configuration', true);
    }
  }

  private isValidConfig(config: any): config is AdaptivePersonaConfig {
    return (
      config &&
      typeof config.version === 'string' &&
      config.thresholds &&
      typeof config.thresholds.studyBuddyStart === 'number' &&
      typeof config.thresholds.teacherStart === 'number' &&
      typeof config.thresholds.studyBuddyReturn === 'number' &&
      typeof config.thresholds.teacherReturn === 'number' &&
      typeof config.thresholds.mentorStart === 'number'
    );
  }

  private saveConfiguration(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch (error) {
      this.handleConfigError('Failed to save configuration', false);
    }
  }

  private getDefaultThresholds(): PersonaThresholds {
    return {
      studyBuddyStart: 0,
      teacherStart: 10,
      studyBuddyReturn: 28,
      teacherReturn: 32,
      mentorStart: 40
    };
  }

  private validateThresholds(): void {
    const { studyBuddyStart, teacherStart, studyBuddyReturn, teacherReturn, mentorStart } = this.thresholds;
    
    // Check if thresholds are in ascending order and valid
    const isValid = (
      studyBuddyStart >= 0 &&
      teacherStart > studyBuddyStart &&
      studyBuddyReturn > teacherStart &&
      teacherReturn > studyBuddyReturn &&
      mentorStart > teacherReturn &&
      // Ensure reasonable values (not more than 24 hours)
      mentorStart <= 1440
    );

    if (!isValid) {
      this.handleConfigError('Invalid persona thresholds - using defaults', true);
      this.thresholds = this.getDefaultThresholds();
      this.config.thresholds = this.thresholds;
    }
  }

  private handleConfigError(message: string, recoverable: boolean): void {
    const error: AdaptivePersonaError = {
      type: 'CONFIG_ERROR',
      message,
      timestamp: Date.now(),
      recoverable
    };
    
    console.error(`[AdaptiveEngine] ${message}`);
    this.onError?.(error);
  }

  getCurrentPersona(): PersonaType {
    return this.currentPersona;
  }

  shouldSwitchPersona(elapsedMinutes: number): boolean {
    const nextPersona = this.getNextPersona(elapsedMinutes);
    return nextPersona !== this.currentPersona;
  }

  getNextPersona(elapsedMinutes: number): PersonaType {
    const { teacherStart, studyBuddyReturn, teacherReturn, mentorStart } = this.thresholds;

    // Persona switching logic based on time ranges
    if (elapsedMinutes >= mentorStart) {
      return 'mentor';
    }
    if (elapsedMinutes >= teacherReturn) {
      return 'teacher';
    }
    if (elapsedMinutes >= studyBuddyReturn) {
      return 'study-buddy';
    }
    if (elapsedMinutes >= teacherStart) {
      return 'teacher';
    }
    return 'study-buddy';
  }

  updateConfiguration(thresholds: PersonaThresholds): void {
    const oldThresholds = { ...this.thresholds };
    this.thresholds = { ...thresholds };
    
    // Validate new thresholds
    this.validateThresholds();
    
    // Update config and save
    this.config.thresholds = this.thresholds;
    this.saveConfiguration();
    
    console.log('[AdaptiveEngine] Configuration updated:', {
      old: oldThresholds,
      new: this.thresholds
    });
  }

  updatePersona(elapsedMinutes: number): PersonaType {
    const newPersona = this.getNextPersona(elapsedMinutes);
    if (newPersona !== this.currentPersona) {
      const oldPersona = this.currentPersona;
      this.currentPersona = newPersona;
      console.log(`[AdaptiveEngine] Persona switched: ${oldPersona} → ${newPersona} (${elapsedMinutes}min)`);
    }
    return this.currentPersona;
  }

  getThresholds(): PersonaThresholds {
    return { ...this.thresholds };
  }

  getConfig(): AdaptivePersonaConfig {
    return { ...this.config };
  }

  resetPersona(): void {
    this.currentPersona = 'study-buddy';
  }

  // Get persona timeline for debugging/display
  getPersonaTimeline(): Array<{ start: number; end: number; persona: PersonaType }> {
    const { teacherStart, studyBuddyReturn, teacherReturn, mentorStart } = this.thresholds;
    
    return [
      { start: 0, end: teacherStart, persona: 'study-buddy' },
      { start: teacherStart, end: studyBuddyReturn, persona: 'teacher' },
      { start: studyBuddyReturn, end: teacherReturn, persona: 'study-buddy' },
      { start: teacherReturn, end: mentorStart, persona: 'teacher' },
      { start: mentorStart, end: Infinity, persona: 'mentor' }
    ];
  }

  // Get expected persona for a given time (for testing)
  static getExpectedPersona(elapsedMinutes: number, thresholds?: PersonaThresholds): PersonaType {
    const t = thresholds || DEFAULT_CONFIG.thresholds;
    
    if (elapsedMinutes >= t.mentorStart) return 'mentor';
    if (elapsedMinutes >= t.teacherReturn) return 'teacher';
    if (elapsedMinutes >= t.studyBuddyReturn) return 'study-buddy';
    if (elapsedMinutes >= t.teacherStart) return 'teacher';
    return 'study-buddy';
  }

  // Static method to clear all configuration
  static clearConfiguration(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.CONFIG);
    } catch (error) {
      console.warn('[AdaptiveEngine] Failed to clear configuration:', error);
    }
  }
}