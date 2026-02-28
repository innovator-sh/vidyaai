import { PersonaManager, PersonaType, PersonaTransitionCallback } from '../types/adaptive-persona';

export class PersonaManagerImpl implements PersonaManager {
  currentPersona: PersonaType = 'study-buddy';
  onPersonaSwitch?: PersonaTransitionCallback;
  private transitionHistory: Array<{ from: PersonaType; to: PersonaType; timestamp: number }> = [];

  constructor(onPersonaSwitch?: PersonaTransitionCallback) {
    this.onPersonaSwitch = onPersonaSwitch;
  }

  switchPersona(newPersona: PersonaType): void {
    if (newPersona === this.currentPersona) {
      return; // No change needed
    }

    const oldPersona = this.currentPersona;
    this.currentPersona = newPersona;

    // Record transition
    this.transitionHistory.push({
      from: oldPersona,
      to: newPersona,
      timestamp: Date.now()
    });

    // Keep only last 50 transitions to prevent memory bloat
    if (this.transitionHistory.length > 50) {
      this.transitionHistory = this.transitionHistory.slice(-50);
    }

    console.log(`[PersonaManager] Switched from ${oldPersona} to ${newPersona}`);
    
    // Notify listeners
    this.onPersonaSwitch?.(oldPersona, newPersona);
  }

  getSystemPrompt(): string {
    const base = 'You are VidyaAI, an intelligent educational AI tutor. ' +
      'When the user provides a <context> block, use it as the primary source of information to answer their question. ' +
      'Be detailed, accurate, and educational in your responses. Format using markdown where appropriate.';

    const personas: Record<PersonaType, string> = {
      'study-buddy': `${base} Speak like a friendly study partner — encouraging, relatable examples, make learning fun. Use casual language and provide emotional support. Keep responses conversational and upbeat.`,
      'teacher': `${base} Speak like an experienced teacher — structured explanations, step-by-step guidance, check for understanding. Be methodical and thorough. Break down complex concepts into digestible parts.`,
      'mentor': `${base} Speak like a wise mentor — strategic advice, big-picture thinking, career guidance. Focus on long-term learning goals and deeper insights. Ask thought-provoking questions and encourage independent thinking.`
    };

    return personas[this.currentPersona];
  }

  getPersonaDisplayName(): string {
    const displayNames: Record<PersonaType, string> = {
      'study-buddy': 'Study Buddy',
      'teacher': 'Teacher',
      'mentor': 'Mentor'
    };
    return displayNames[this.currentPersona];
  }

  getPersonaIcon(): string {
    const icons: Record<PersonaType, string> = {
      'study-buddy': '🧑‍🤝‍🧑',
      'teacher': '👩‍🏫',
      'mentor': '🧭'
    };
    return icons[this.currentPersona];
  }

  getPersonaDescription(): string {
    const descriptions: Record<PersonaType, string> = {
      'study-buddy': 'Friendly and encouraging, perfect for getting started and staying motivated',
      'teacher': 'Structured and thorough, ideal for learning new concepts step-by-step',
      'mentor': 'Strategic and insightful, great for deep thinking and long-term guidance'
    };
    return descriptions[this.currentPersona];
  }

  getPersonaColor(): string {
    const colors: Record<PersonaType, string> = {
      'study-buddy': '#10B981', // Green
      'teacher': '#3B82F6',     // Blue
      'mentor': '#8B5CF6'       // Purple
    };
    return colors[this.currentPersona];
  }

  getTransitionHistory(): Array<{ from: PersonaType; to: PersonaType; timestamp: number }> {
    return [...this.transitionHistory];
  }

  getLastTransition(): { from: PersonaType; to: PersonaType; timestamp: number } | null {
    return this.transitionHistory.length > 0 
      ? this.transitionHistory[this.transitionHistory.length - 1]
      : null;
  }

  reset(): void {
    const oldPersona = this.currentPersona;
    this.currentPersona = 'study-buddy';
    this.transitionHistory = [];
    
    if (oldPersona !== 'study-buddy') {
      this.onPersonaSwitch?.(oldPersona, 'study-buddy');
    }
  }

  // Get persona characteristics for UI display
  getPersonaCharacteristics(): {
    tone: string;
    approach: string;
    bestFor: string;
  } {
    const characteristics: Record<PersonaType, { tone: string; approach: string; bestFor: string }> = {
      'study-buddy': {
        tone: 'Casual and encouraging',
        approach: 'Supportive and motivational',
        bestFor: 'Getting started and staying motivated'
      },
      'teacher': {
        tone: 'Clear and methodical',
        approach: 'Structured step-by-step guidance',
        bestFor: 'Learning new concepts thoroughly'
      },
      'mentor': {
        tone: 'Thoughtful and strategic',
        approach: 'Big-picture thinking and reflection',
        bestFor: 'Deep insights and long-term planning'
      }
    };
    return characteristics[this.currentPersona];
  }

  // Check if persona is appropriate for current context
  isPersonaAppropriate(elapsedMinutes: number): boolean {
    // This could be enhanced with more sophisticated logic
    // For now, we trust the adaptive engine's decisions
    return true;
  }

  // Get transition animation class for UI
  getTransitionClass(): string {
    const lastTransition = this.getLastTransition();
    if (!lastTransition || Date.now() - lastTransition.timestamp > 3000) {
      return '';
    }
    return 'persona-transition';
  }
}