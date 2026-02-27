/**
 * API Client Module
 * 
 * Provides typed methods for backend API calls with automatic Firebase
 * ID token inclusion and error handling.
 */

import { auth } from './firebase';

// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Request/Response types
export interface SessionStartParams {
  sessionId: string;
  documentText: string;
  queryText: string;
}

export interface FollowUpParams {
  sessionId: string;
  queryText: string;
}

export interface SessionEndParams {
  sessionId: string;
}

export interface RootCauseAnalysis {
  core_gap: string;
  misconception?: string;
  topic_area: string;
  reasoning: string;
}

export interface SessionStartResponse {
  session_id: string;
  root_cause_analysis: RootCauseAnalysis;
  background_concepts: string[];
  solution: string;
  improvement_advice?: string;
}

export interface FollowUpResponse {
  solution: string;
  improvement_advice?: string;
}

export interface SessionEndResponse {
  status: string;
  summary: string;
}

/**
 * API Client class for making authenticated requests to the backend
 */
export class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get Firebase ID token for authentication
   */
  private async getIdToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  /**
   * Get Firebase UID
   */
  private getFirebaseUid(): string {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return user.uid;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const idToken = await this.getIdToken();
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle specific error codes
        if (response.status === 401) {
          throw new Error('Authentication failed. Please sign in again.');
        } else if (response.status === 403) {
          throw new Error('You don\'t have permission to access this resource.');
        } else if (response.status === 404) {
          throw new Error(errorData.detail || 'Resource not found.');
        } else if (response.status === 503) {
          throw new Error('Service temporarily unavailable. Please try again in a moment.');
        } else {
          throw new Error(errorData.detail || 'An error occurred. Please try again.');
        }
      }

      return await response.json();
    } catch (error: any) {
      // Network errors
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw error;
    }
  }

  /**
   * Start a new chat session
   */
  async startSession(params: SessionStartParams): Promise<SessionStartResponse> {
    const firebaseUid = this.getFirebaseUid();
    
    return this.request<SessionStartResponse>('/rag/session/start', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: firebaseUid,
        session_id: params.sessionId,
        document_text: params.documentText,
        query_text: params.queryText,
      }),
    });
  }

  /**
   * Send a follow-up query in an existing session
   */
  async sendFollowUp(params: FollowUpParams): Promise<FollowUpResponse> {
    const firebaseUid = this.getFirebaseUid();
    
    return this.request<FollowUpResponse>('/rag/session/followup', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: firebaseUid,
        session_id: params.sessionId,
        query_text: params.queryText,
      }),
    });
  }

  /**
   * End a chat session
   */
  async endSession(params: SessionEndParams): Promise<SessionEndResponse> {
    const firebaseUid = this.getFirebaseUid();
    
    return this.request<SessionEndResponse>('/rag/session/end', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: firebaseUid,
        session_id: params.sessionId,
      }),
    });
  }
}

// Export singleton instance
export const apiClient = new APIClient();
