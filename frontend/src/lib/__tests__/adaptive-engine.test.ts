import { AdaptiveEngineImpl } from '../adaptive-engine';
import { PersonaType } from '../../types/adaptive-persona';

describe('AdaptiveEngineImpl', () => {
  let engine: AdaptiveEngineImpl;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    engine = new AdaptiveEngineImpl();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('persona switching logic', () => {
    test('should return study-buddy for 0-10 minutes', () => {
      expect(engine.getNextPersona(0)).toBe('study-buddy');
      expect(engine.getNextPersona(5)).toBe('study-buddy');
      expect(engine.getNextPersona(9)).toBe('study-buddy');
    });

    test('should return teacher for 10-28 minutes', () => {
      expect(engine.getNextPersona(10)).toBe('teacher');
      expect(engine.getNextPersona(15)).toBe('teacher');
      expect(engine.getNextPersona(27)).toBe('teacher');
    });

    test('should return study-buddy for 28-32 minutes (re-engagement)', () => {
      expect(engine.getNextPersona(28)).toBe('study-buddy');
      expect(engine.getNextPersona(30)).toBe('study-buddy');
      expect(engine.getNextPersona(31)).toBe('study-buddy');
    });

    test('should return teacher for 32-40 minutes', () => {
      expect(engine.getNextPersona(32)).toBe('teacher');
      expect(engine.getNextPersona(35)).toBe('teacher');
      expect(engine.getNextPersona(39)).toBe('teacher');
    });

    test('should return mentor for 40+ minutes', () => {
      expect(engine.getNextPersona(40)).toBe('mentor');
      expect(engine.getNextPersona(60)).toBe('mentor');
      expect(engine.getNextPersona(120)).toBe('mentor');
    });
  });

  describe('persona switching detection', () => {
    test('should detect when persona switch is needed', () => {
      // Start with study-buddy (default)
      expect(engine.getCurrentPersona()).toBe('study-buddy');
      
      // Should switch to teacher at 10 minutes
      expect(engine.shouldSwitchPersona(10)).toBe(true);
      
      // Update persona and check
      engine.updatePersona(10);
      expect(engine.getCurrentPersona()).toBe('teacher');
      expect(engine.shouldSwitchPersona(15)).toBe(false); // No switch needed
      
      // Should switch back to study-buddy at 28 minutes
      expect(engine.shouldSwitchPersona(28)).toBe(true);
    });
  });

  describe('configuration management', () => {
    test('should use default thresholds', () => {
      const thresholds = engine.getThresholds();
      expect(thresholds.studyBuddyStart).toBe(0);
      expect(thresholds.teacherStart).toBe(10);
      expect(thresholds.studyBuddyReturn).toBe(28);
      expect(thresholds.teacherReturn).toBe(32);
      expect(thresholds.mentorStart).toBe(40);
    });

    test('should update configuration', () => {
      const newThresholds = {
        studyBuddyStart: 0,
        teacherStart: 5,
        studyBuddyReturn: 25,
        teacherReturn: 30,
        mentorStart: 35
      };

      engine.updateConfiguration(newThresholds);
      
      // Test with new thresholds
      expect(engine.getNextPersona(5)).toBe('teacher');
      expect(engine.getNextPersona(25)).toBe('study-buddy');
      expect(engine.getNextPersona(35)).toBe('mentor');
    });

    test('should validate thresholds and use defaults for invalid ones', () => {
      const invalidThresholds = {
        studyBuddyStart: 0,
        teacherStart: 30, // Invalid: should be less than studyBuddyReturn
        studyBuddyReturn: 20,
        teacherReturn: 25,
        mentorStart: 35
      };

      engine.updateConfiguration(invalidThresholds);
      
      // Should fall back to defaults
      const thresholds = engine.getThresholds();
      expect(thresholds.teacherStart).toBe(10); // Default value
    });
  });

  describe('static utility methods', () => {
    test('getExpectedPersona should work correctly', () => {
      expect(AdaptiveEngineImpl.getExpectedPersona(5)).toBe('study-buddy');
      expect(AdaptiveEngineImpl.getExpectedPersona(15)).toBe('teacher');
      expect(AdaptiveEngineImpl.getExpectedPersona(30)).toBe('study-buddy');
      expect(AdaptiveEngineImpl.getExpectedPersona(35)).toBe('teacher');
      expect(AdaptiveEngineImpl.getExpectedPersona(45)).toBe('mentor');
    });
  });
});

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});