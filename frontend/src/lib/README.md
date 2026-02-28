# Adaptive Persona Engine

The Adaptive Persona Engine automatically switches between Study Buddy, Teacher, and Mentor personas based on session duration to optimize learning engagement.

## Overview

The system operates on the principle that different learning phases require different types of support:

- **Study Buddy (🧑‍🤝‍🧑)**: Warm, encouraging persona for initial engagement and re-engagement phases
- **Teacher (👩‍🏫)**: Structured, educational persona for core learning phases  
- **Mentor (🧭)**: Deep, reflective persona for extended learning sessions

## Persona Timeline

```
0 ────────── 10 ──────────────── 28 ── 32 ──────── 40 ──────────▶ minutes
  Study Buddy    Teacher         Study Buddy  Teacher  Mentor
  (warm up)      (core learning) (dip)        (resume) (deep session)
```

| Phase | Time | Persona | Purpose |
|-------|------|---------|---------|
| Warm-up | 0-10 min | Study Buddy | Ease the student in, build comfort |
| Core learning | 10-28 min | Teacher | Explain concepts, check understanding |
| Re-engagement | 28-32 min | Study Buddy | Attention dip at ~30 min — re-energize |
| Resume learning | 32-40 min | Teacher | Back to focused learning |
| Deep session | 40+ min | Mentor | Guide thinking, Socratic questioning |

## Usage

### Basic Usage with React Hook

```typescript
import { useAdaptivePersona } from '../hooks/useAdaptivePersona';

function ChatComponent() {
  const {
    currentPersona,
    elapsedMinutes,
    personaDisplayInfo,
    resetSession,
    recordMessage,
    getSystemPrompt
  } = useAdaptivePersona({
    onPersonaSwitch: (oldPersona, newPersona) => {
      console.log(`Switched from ${oldPersona} to ${newPersona}`);
    }
  });

  // Use currentPersona and getSystemPrompt() in your chat API calls
  // Call recordMessage() when user sends a message
  // Display personaDisplayInfo in your UI
}
```

### Direct Engine Usage

```typescript
import { AdaptivePersonaEngine } from '../lib/adaptive-persona-engine';

const engine = new AdaptivePersonaEngine({
  thresholds: {
    studyBuddyStart: 0,
    teacherStart: 10,
    studyBuddyReturn: 28,
    teacherReturn: 32,
    mentorStart: 40
  }
}, {
  onPersonaSwitch: (oldPersona, newPersona) => {
    console.log(`Persona switched: ${oldPersona} → ${newPersona}`);
  }
});

// Get current persona for API calls
const systemPrompt = engine.getSystemPrompt();
const currentPersona = engine.getCurrentPersona();

// Record user messages
engine.recordMessage();

// Reset session
engine.resetSession();
```

## API Integration

Update your chat API calls to include the adaptive persona:

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: userInput,
    adaptivePersona: currentPersona, // Use adaptive persona
    sessionElapsedMinutes: elapsedMinutes, // For analytics
    conversationHistory: messages,
    // ... other fields
  }),
});
```

## Configuration

### Time Thresholds

Customize when persona switches occur:

```typescript
const customConfig = {
  thresholds: {
    studyBuddyStart: 0,
    teacherStart: 5,        // Switch to teacher after 5 minutes
    studyBuddyReturn: 25,   // Re-engagement at 25 minutes
    teacherReturn: 30,      // Resume teacher at 30 minutes
    mentorStart: 35         // Mentor mode at 35 minutes
  }
};
```

### Analytics Configuration

```typescript
const config = {
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
```

## Features

### Session Analytics

Track time spent with each persona:

```typescript
const analytics = engine.getSessionAnalytics();
console.log(analytics);
// {
//   totalDuration: 45,
//   personaBreakdown: {
//     'study-buddy': 12,
//     'teacher': 28,
//     'mentor': 5
//   },
//   switchCount: 4,
//   sessionId: "session_123..."
// }
```

### Session Summary

Get a formatted summary:

```typescript
const summary = engine.getSessionSummary();
console.log(summary);
// "📊 **Session Summary**
//  **Total Duration:** 45min
//  **Persona Switches:** 4
//  **Time Distribution:**
//  • 🧑‍🤝‍🧑 Study Buddy: 12min (27%)
//  • 👩‍🏫 Teacher: 28min (62%)
//  • 🧭 Mentor: 5min (11%)"
```

### Persistence

Session data persists across page refreshes using localStorage:

- Session timer state
- Analytics data (last 30 days)
- Configuration settings

## Error Handling

The engine includes comprehensive error handling:

```typescript
const engine = new AdaptivePersonaEngine(config, {
  onError: (error) => {
    console.error('Adaptive Persona Error:', error);
    // Handle different error types:
    // - TIMER_ERROR: Session timing issues
    // - STORAGE_ERROR: localStorage problems
    // - CONFIG_ERROR: Invalid configuration
    // - API_ERROR: Integration failures
  }
});
```

## Testing

Run the test suite:

```bash
npm test -- adaptive-engine.test.ts
```

The engine includes property-based tests that verify:
- Correct persona switching at all time boundaries
- Configuration validation
- Session persistence
- Analytics accuracy

## Cleanup

Clear all stored data:

```typescript
AdaptivePersonaEngine.clearAllData();
```

## Browser Compatibility

- Requires localStorage support
- Uses modern JavaScript features (ES2020+)
- Tested on Chrome, Firefox, Safari, Edge

## Performance

- Minimal CPU usage (updates every 30 seconds)
- Small memory footprint (~50KB including analytics)
- Efficient localStorage usage with automatic cleanup