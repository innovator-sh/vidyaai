import { SessionTimerImpl } from './session-timer';
import { AdaptiveEngineImpl } from './adaptive-engine';
import { PersonaManagerImpl } from './persona-manager';
import { SessionAnalyticsImpl } from './session-analytics';
import { 
  PersonaType, 
  SessionAnalytics, 
  AdaptivePersonaConfig, 
  AdaptivePersonaError,
  PersonaTransitionCallback,
  TimerUpdateCallback,
  AnalyticsUpdateCallback
} from '../types/adaptive-persona';

export interface AdaptivePersonaEngineCallbacks {
  onPersonaSwitch?: PersonaTransitionCallback;
  onTimerUpdate?: TimerUpdateCallback;
  onAnalyticsUpdate?: AnalyticsUpdateCallback;
  onError?: (error: AdaptivePersonaError) => void;
}

export class AdaptivePersonaEngine {
  private timer: SessionTimerImpl;
  private engine: AdaptiveEngineImpl;
  private personaManager: PersonaManagerImpl;
  private analytics: SessionAnalyticsImpl;
  private updateInterval: NodeJS.Timeout | null = null;
  private callbacks: AdaptivePersonaEngineCallbacks;
  private isActive: boolean = true;

  constructor(config?: Partial<AdaptivePersonaConfig>, callbacks?: AdaptivePersonaEngineCallbacks) {
    this.callbacks = callbacks || {};

    // Initialize components
    this.timer = new SessionTimerImpl(this.callbacks.onError);
    this.engine = new AdaptiveEngineImpl(config, this.callbacks.onError);
    this.personaManager = new PersonaManagerImpl(this.handlePersonaSwitch.bind(this));
    this.analytics = new SessionAnalyticsImpl(this.timer.getSessionId(), this.callbacks.onError);

    // Set initial persona
    const initialPersona = this.engine.getNextPersona(0);
    this.personaManager.switchPersona(initialPersona);

    // Start the update loop
    this.startUpdateLoop();

    console.log('[AdaptivePersonaEngine] Initialized with session ID:', this.timer.getSessionId());
  }

  private handlePersonaSwitch(oldPersona: PersonaType, newPersona: PersonaType): void {
    const elapsedMinutes = this.timer.getElapsedTime();
    
    // Record the switch in analytics
    this.analytics.recordPersonaSwitch(oldPersona, newPersona, elapsedMinutes, true);
    
    // Save analytics to storage
    this.analytics.saveToStorage();
    
    // Notify callbacks
    this.callbacks.onPersonaSwitch?.(oldPersona, newPersona);
    this.callbacks.onAnalyticsUpdate?.(this.analytics.getCurrentSessionAnalytics());
    
    console.log(`[AdaptivePersonaEngine] Persona switched: ${oldPersona} → ${newPersona} at ${elapsedMinutes}min`);
  }

  private startUpdateLoop(): void {
    // Update every 30 seconds to check for persona switches
    this.updateInterval = setInterval(() => {
      if (!this.isActive) return;

      const elapsedMinutes = this.timer.getElapsedTime();
      
      // Check if persona should switch
      if (this.engine.shouldSwitchPersona(elapsedMinutes)) {
        const newPersona = this.engine.getNextPersona(elapsedMinutes);
        this.personaManager.switchPersona(newPersona);
      }

      // Update engine's current persona tracking
      this.engine.updatePersona(elapsedMinutes);
      
      // Notify timer update callback
      this.callbacks.onTimerUpdate?.(elapsedMinutes);
      
    }, 30000); // 30 seconds
  }

  // Public API methods
  getCurrentPersona(): PersonaType {
    return this.personaManager.currentPersona;
  }

  getSystemPrompt(): string {
    return this.personaManager.getSystemPrompt();
  }

  getElapsedTime(): number {
    return this.timer.getElapsedTime();
  }

  getSessionAnalytics(): SessionAnalytics {
    return this.analytics.getCurrentSessionAnalytics();
  }

  getSessionSummary(): string {
    return this.analytics.getSessionSummary();
  }

  recordMessage(): void {
    this.analytics.recordMessage();
  }

  resetSession(): void {
    console.log('[AdaptivePersonaEngine] Resetting session');
    
    // Reset all components
    this.timer.reset();
    this.engine.resetPersona();
    this.personaManager.reset();
    this.analytics.reset();
    
    // Set initial persona
    const initialPersona = this.engine.getNextPersona(0);
    this.personaManager.switchPersona(initialPersona);
    
    // Save analytics
    this.analytics.saveToStorage();
    
    console.log('[AdaptivePersonaEngine] Session reset complete');
  }

  pauseSession(): void {
    this.isActive = false;
    this.timer.pause();
    console.log('[AdaptivePersonaEngine] Session paused');
  }

  resumeSession(): void {
    this.isActive = true;
    this.timer.resume();
    console.log('[AdaptivePersonaEngine] Session resumed');
  }

  updateConfiguration(config: Partial<AdaptivePersonaConfig>): void {
    if (config.thresholds) {
      this.engine.updateConfiguration(config.thresholds);
      console.log('[AdaptivePersonaEngine] Configuration updated');
    }
  }

  // Get persona display information
  getPersonaDisplayInfo() {
    return {
      name: this.personaManager.getPersonaDisplayName(),
      icon: this.personaManager.getPersonaIcon(),
      description: this.personaManager.getPersonaDescription(),
      color: this.personaManager.getPersonaColor(),
      characteristics: this.personaManager.getPersonaCharacteristics()
    };
  }

  // Get timeline information for UI
  getPersonaTimeline() {
    return this.engine.getPersonaTimeline();
  }

  // Get current session state for debugging
  getSessionState() {
    return {
      sessionId: this.timer.getSessionId(),
      elapsedMinutes: this.timer.getElapsedTime(),
      currentPersona: this.personaManager.currentPersona,
      isActive: this.isActive,
      thresholds: this.engine.getThresholds(),
      analytics: this.analytics.getCurrentSessionAnalytics()
    };
  }

  // Force a persona switch (for testing or manual override)
  forcePersonaSwitch(persona: PersonaType): void {
    const oldPersona = this.personaManager.currentPersona;
    this.personaManager.switchPersona(persona);
    
    // Record as manual switch
    this.analytics.recordPersonaSwitch(oldPersona, persona, this.timer.getElapsedTime(), false);
    this.analytics.saveToStorage();
    
    console.log(`[AdaptivePersonaEngine] Forced persona switch: ${oldPersona} → ${persona}`);
  }

  // Check if a persona switch is imminent (within next 2 minutes)
  isPersonaSwitchImminent(): { imminent: boolean; nextPersona?: PersonaType; minutesUntil?: number } {
    const currentMinutes = this.timer.getElapsedTime();
    const timeline = this.engine.getPersonaTimeline();
    
    for (const segment of timeline) {
      if (currentMinutes < segment.start && segment.start - currentMinutes <= 2) {
        return {
          imminent: true,
          nextPersona: segment.persona,
          minutesUntil: segment.start - currentMinutes
        };
      }
    }
    
    return { imminent: false };
  }

  // Cleanup method
  destroy(): void {
    console.log('[AdaptivePersonaEngine] Destroying engine');
    
    this.isActive = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Save final analytics
    this.analytics.saveToStorage();
    
    // Cleanup timer
    this.timer.destroy();
    
    console.log('[AdaptivePersonaEngine] Engine destroyed');
  }

  // Static utility methods
  static clearAllData(): void {
    SessionTimerImpl.clearStorage();
    SessionAnalyticsImpl.clearStorage();
    AdaptiveEngineImpl.clearConfiguration();
    console.log('[AdaptivePersonaEngine] All data cleared');
  }

  static getStoredAnalytics() {
    return SessionAnalyticsImpl.loadFromStorage();
  }

  static getAggregateStats() {
    return SessionAnalyticsImpl.getAggregateStats();
  }
}