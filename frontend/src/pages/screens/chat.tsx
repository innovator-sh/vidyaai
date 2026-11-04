import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { Plus, Database, Moon, ClockCounterClockwise, ChartPie, Waves, Paperclip, ArrowRight, FileText, Lightbulb, PencilSimple, Exam, CaretRight, CaretLeft, DotsThree, ChatCircleDots, Star, Microphone, X, Books, CaretDown, CaretUp, FlowArrow, FileDoc, DownloadSimple, Timer, ArrowClockwise, SquaresFour, Stack, User } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { Loader } from '../../components/retroui/Loader';
import VerticalNav from '../../components/VerticalNav';
import { useAuth } from '../../contexts/AuthContext';
import MarkdownMessage from '../../components/MarkdownMessage';
import ActionMenu from '../../components/ActionMenu';
import { useAdaptivePersona } from '../../hooks/useAdaptivePersona';
import { PersonaType } from '../../types/adaptive-persona';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { api, newMessageId, type QuizQuestion } from '../../lib/apiClient';
import { errorMessage } from '../../lib/errors';
import { MAX_UPLOAD_BYTES, PollTimeoutError, pollDocument } from '../../lib/documents';
import AttachmentChip, { type Attachment } from '../../components/AttachmentChip';
import i18n, { currentLanguage, localeFor } from '../../i18n';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const MermaidDiagram = dynamic(() => import('../../components/MermaidDiagram'), {
  ssr: false,
});

interface Message {
  role: 'user' | 'ai';
  content: string;
  hasDiagram?: boolean;
  diagramCode?: string;
  imageUrl?: string;
  isError?: boolean;
  key?: string;
}

interface QuizData {
  questions: QuizQuestion[];
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface RecentChat {
  id: string;
  title: string;
  is_favorite: boolean;
}

/** Localised message for any failure (uses the global i18n instance so it can be used from callbacks). */
function errorText(err: unknown): string {
  return errorMessage(err, i18n.t);
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
}

function Chat() {
  const router = useRouter();
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = localeFor(i18nInstance.resolvedLanguage || i18nInstance.language);
  const { user } = useAuth();

  // Knowledge Base document selected via ?docId=...&docName=...
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [kbDocName, setKbDocName] = useState<string>('');
  // Server-side conversation this chat is attached to (null until first message is sent)
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Read Knowledge Base doc from URL query on mount
  useEffect(() => {
    if (router.isReady && router.query.docId) {
      setDocumentId(String(router.query.docId));
      setKbDocName(router.query.docName ? String(router.query.docName) : i18n.t('chat.document'));
    }
  }, [router.isReady, router.query.docId, router.query.docName]);

  const navItems = [
    { label: 'Home', link: '/' },
    { label: 'Chat', link: '/screens/chat' },
    { label: 'Stats', link: '/screens/stats' },
    { label: 'Memory', link: '/screens/memory' },
  ];

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const attachAbortRef = useRef<AbortController | null>(null);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<number | null>(null);
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [currentDiagram, setCurrentDiagram] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [currentReport, setCurrentReport] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Quiz Modal State
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Web Speech Recognition State
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Adaptive Persona Engine Integration
  const {
    currentPersona,
    elapsedMinutes,
    sessionAnalytics,
    personaDisplayInfo,
    resetSession,
    recordMessage,
    getSystemPrompt,
    getSessionSummary,
    lastError,
    clearError
  } = useAdaptivePersona({
    onPersonaSwitch: (oldPersona: PersonaType, newPersona: PersonaType) => {
      console.log(`Persona switched from ${oldPersona} to ${newPersona}`);
      // Optional: Show a subtle notification to the user
    },
    onError: (error) => {
      console.error('Adaptive Persona Error:', error);
    }
  });

  // State for showing session analytics
  const [showSessionAnalytics, setShowSessionAnalytics] = useState(false);

  // Stop TTS when closing page
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Change to false for standard toggle behavior Let it stop manually or auto
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          setInput(prev => prev + (prev ? ' ' : '') + final);
          setInterimTranscript('');
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert(i18n.t('chat.micDenied'));
        } else if (event.error === 'audio-capture') {
          alert(i18n.t('chat.micMissing'));
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Keep speech recognition in the chosen language
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = locale;
  }, [locale]);

  // Abort any in-flight chat stream / attachment processing when leaving the page
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      attachAbortRef.current?.abort();
    };
  }, []);

  const handleToggleSpeech = (text: string, idx: number) => {
    if (isSpeaking === idx) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
    } else {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale;
      u.onend = () => setIsSpeaking(null);
      window.speechSynthesis.speak(u);
      setIsSpeaking(idx);
    }
  };

  const stopRecordingAndGetTranscript = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
        resolve(null);
        return;
      }
      const mediaRecorder = mediaRecorderRef.current;

      const handleStop = async () => {
        setIsTyping(true);
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        mediaRecorder.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());

        const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';

        try {
          const data = await api.stt(audioBlob, `audio.${fileExt}`);
          resolve(data.text || null);
        } catch (e) {
          console.error('Speech-to-text failed', e);
          setChatError(errorText(e));
          resolve(null);
        } finally {
          setIsTyping(false);
        }
      };

      mediaRecorder.onstop = handleStop;
      mediaRecorder.stop();
      setIsRecording(false);
    });
  };

  const handleToggleMic = async () => {
    // Try Web Speech API first
    if (recognitionRef.current) {
      if (isRecording) {
        recognitionRef.current.stop();
        setIsRecording(false);
        // The onend handler will process any final transcript,
        // but we want to make sure the user knows we stopped
        if (interimTranscript) {
          setInput(prev => prev + (prev ? ' ' : '') + interimTranscript);
          setInterimTranscript('');
        }
      } else {
        try {
          recognitionRef.current.continuous = false; // toggle rather than hold continuous
          recognitionRef.current.start();
          setIsRecording(true);
        } catch (err) {
          console.error('Speech recognition start error:', err);
        }
      }
      return;
    }

    // Fallback to MediaRecorder
    if (isRecording) {
      const transcript = await stopRecordingAndGetTranscript();
      if (transcript) {
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm;codecs=opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert(t('chat.micUnavailable'));
    }
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('report-content-to-download');
    if (!element) return;
    try {
      // Clone the element to avoid modifying the actual DOM
      const clone = element.cloneNode(true) as HTMLElement;

      // html2canvas (used by html2pdf) crashes on 'lab()' CSS colors.
      // We force all text colors to simple hex in the clone.
      const allElems = clone.querySelectorAll('*');
      allElems.forEach((el) => {
        const hEl = el as HTMLElement;

        // Strip out all inline classes to prevent html2canvas from evaluating Tailwind's lab() variables
        const currentClasses = hEl.getAttribute('class') || '';
        hEl.setAttribute('class', '');

        // Apply strictly safe inline styles to preserve visual structure
        hEl.style.cssText = `
          color: #1a1a2e !important;
          background-color: transparent !important;
          font-family: sans-serif !important;
          border-color: #e0e0e0 !important;
          margin: ${window.getComputedStyle(hEl).margin};
          padding: ${window.getComputedStyle(hEl).padding};
          font-size: ${window.getComputedStyle(hEl).fontSize};
          font-weight: ${window.getComputedStyle(hEl).fontWeight};
          display: ${window.getComputedStyle(hEl).display};
        `;

        // Handle SVGs specifically
        if (hEl.tagName.toLowerCase() === 'svg' || hEl.tagName.toLowerCase() === 'path') {
          hEl.style.cssText += 'fill: currentColor !important;';
        }
      });
      clone.style.cssText = 'background-color: #ffffff !important; color: #1a1a2e !important; padding: 20px;';

      // Create a temporary hidden container for the clone
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.appendChild(clone);
      document.body.appendChild(container);

      const html2pdf = (await import('html2pdf.js')).default;
      const opt = {
        margin: 15,
        filename: 'VidyaAI_Report.pdf',
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(clone).save();

      // Cleanup
      document.body.removeChild(container);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    }
  };

  // Recent + favourite chats for the sidebar
  const refreshRecentChats = useCallback(async () => {
    try {
      const resp = await api.listConversations({ limit: 20 });
      setRecentChats(resp.items.map((c) => ({ id: c.id, title: c.title, is_favorite: c.is_favorite })));
    } catch {
      /* sidebar is non-critical */
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    refreshRecentChats();
  }, [user?.uid, refreshRecentChats]);

  const openConversation = async (id: string) => {
    abortRef.current?.abort();
    setIsTyping(false);
    setChatError(null);
    try {
      const conv = await api.getConversation(id);
      setConversationId(conv.id);
      setMessages(
        conv.messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content,
        })),
      );
      setSidebarCollapsed(true);
    } catch (err) {
      setChatError(errorText(err));
    }
  };

  const handleSubmit = async (e?: { preventDefault: () => void }, overrideInput?: string) => {
    e?.preventDefault();
    if (isTyping || ocrProcessing) return;

    if (attachment && (attachment.status === 'uploading' || attachment.status === 'processing')) {
      setChatError(t('chat.attachmentNotReady'));
      return;
    }
    if (attachment?.status === 'failed') {
      setChatError(t('chat.attachmentFailed'));
      return;
    }

    let textToSubmit = overrideInput !== undefined ? overrideInput : input;

    if (isRecording) {
      const transcript = await stopRecordingAndGetTranscript();
      if (transcript) {
        textToSubmit = textToSubmit ? textToSubmit + ' ' + transcript : transcript;
      }
    }

    if (!textToSubmit.trim() && !attachment) return;

    const userInput = textToSubmit;
    const imageFile = attachment?.kind === 'image' ? attachment.file : null;
    const pdfDocumentId = attachment?.kind === 'pdf' ? attachment.documentId : null;
    // A PDF attached in chat becomes the document context for this and the following turns.
    const activeDocumentId = pdfDocumentId ?? documentId;

    // Build display content for the user's message
    const displayContent = (attachment && !attachment.previewUrl)
      ? `${userInput}${userInput ? '\n' : ''}\u{1F4CE} ${attachment.file.name}`
      : userInput;

    const newMessage: Message = { role: 'user', content: displayContent };
    if (attachment?.previewUrl) {
      newMessage.imageUrl = attachment.previewUrl;
    }

    if (pdfDocumentId && attachment) {
      setDocumentId(pdfDocumentId);
      setKbDocName(attachment.file.name);
    }

    setChatError(null);
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsTyping(true);

    const controller = new AbortController();
    abortRef.current = controller;
    // Idempotency key: generated once per user message
    const messageId = newMessageId();
    let streamed = '';
    const aiKey = `${messageId}:ai`;
    let aiStarted = false;
    let flushHandle: number | null = null;

    const flush = () => {
      flushHandle = null;
      const text = streamed;
      setMessages(prev => prev.map(m => (m.key === aiKey ? { ...m, content: text } : m)));
    };

    try {
      let messageText = userInput.trim();

      if (imageFile) {
        setOcrProcessing(true);
        try {
          const ocr = await api.ocr(imageFile, 'handwriting');
          const extracted = (ocr.text || '').trim();
          messageText = [
            messageText || t('chat.defaultImagePrompt'),
            extracted ? `\n\n${t('chat.extractedText')}\n${extracted}` : '',
          ].join('');
        } finally {
          setOcrProcessing(false);
        }
      }

      for await (const ev of api.chat(
        {
          conversation_id: conversationId,
          message_id: messageId,
          message: messageText.slice(0, 8000),
          persona: currentPersona,
          document_id: activeDocumentId,
          language: currentLanguage(),
        },
        controller.signal,
      )) {
        if (ev.type === 'meta') {
          setConversationId(ev.conversation_id);
        } else if (ev.type === 'token') {
          if (!aiStarted) {
            // First token: create the assistant message and hide the typing indicator
            aiStarted = true;
            setIsTyping(false);
            setMessages(prev => [...prev, { role: 'ai', content: '', key: aiKey }]);
          }
          streamed += ev.text;
          if (flushHandle === null) flushHandle = requestAnimationFrame(flush);
        } else if (ev.type === 'done') {
          recordMessage();
        }
      }
      if (flushHandle !== null) cancelAnimationFrame(flushHandle);
      flush();
      refreshRecentChats();
    } catch (error) {
      if (flushHandle !== null) cancelAnimationFrame(flushHandle);
      if ((error as { name?: string })?.name === 'AbortError') {
        flush();
        return;
      }
      console.error('Chat request failed:', error);
      flush();
      // Keep any partial answer, then append the real error
      setMessages(prev => [...prev, { role: 'ai', content: errorText(error), isError: true }]);
      refreshRecentChats();
    } finally {
      setIsTyping(false);
      setOcrProcessing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setIsTyping(false);
    setConversationId(null);
    setChatError(null);
    setMessages([]);
    setInput('');
    attachAbortRef.current?.abort();
    setAttachment(null);
    // Reset the adaptive persona session
    resetSession();
  };

  // Images are OCR'd on send; PDFs are uploaded right away and polled until the server has indexed them.
  const attachFile = async (file: File) => {
    setChatError(null);
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isPdfFile(file)) {
      setChatError(t('chat.attachmentTypeUnsupported'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setChatError(t('chat.attachmentTooLarge', { name: file.name }));
      return;
    }

    attachAbortRef.current?.abort();
    const controller = new AbortController();
    attachAbortRef.current = controller;
    const patch = (changes: Partial<Attachment>) =>
      setAttachment((prev) => (prev && prev.file === file ? { ...prev, ...changes } : prev));

    if (isImage) {
      setAttachment({ file, kind: 'image', status: 'ready', previewUrl: null, documentId: null });
      const reader = new FileReader();
      reader.onloadend = () => patch({ previewUrl: reader.result as string });
      reader.readAsDataURL(file);
      return;
    }

    setAttachment({ file, kind: 'pdf', status: 'uploading', previewUrl: null, documentId: null });
    try {
      const doc = await api.uploadDocument(file);
      if (controller.signal.aborted) return;
      patch({ documentId: doc.id, status: doc.status === 'ready' ? 'ready' : doc.status === 'failed' ? 'failed' : 'processing' });
      if (doc.status === 'failed') {
        setChatError(t('chat.attachmentFailed'));
        return;
      }
      if (doc.status !== 'ready') {
        const done = await pollDocument(api.getDocument, doc.id, { signal: controller.signal });
        patch({ status: done.status === 'ready' ? 'ready' : 'failed' });
        if (done.status !== 'ready') setChatError(t('chat.attachmentFailed'));
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || controller.signal.aborted) return;
      patch({ status: 'failed' });
      setChatError(err instanceof PollTimeoutError ? t('chat.attachmentTimeout') : errorText(err));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again re-triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (file) void attachFile(file);
  };

  const handleRemoveFile = () => {
    attachAbortRef.current?.abort();
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Scroll-to-bottom
  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200 && messages.length > 0);
      }
    };
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Collapsible messages
  const toggleMessageCollapse = (index: number) => {
    setCollapsedMessages(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  // Flowchart generation
  const handleGenerateFlowchart = async (content: string, messageIndex: number) => {
    try {
      const data = await api.generateFlowchart(content);
      setMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, hasDiagram: true, diagramCode: data.mermaid } : m
      ));
      setCurrentDiagram(data.mermaid);
      setShowDiagramModal(true);
    } catch (err) {
      alert(t('chat.flowchartFailed', { reason: errorText(err) }));
    }
  };

  // Report generation
  const handleGenerateReport = async (content: string) => {
    setIsGeneratingReport(true);
    try {
      const data = await api.generateReport(content);
      setCurrentReport(data.summary);
      setShowReportModal(true);
    } catch (err) {
      alert(t('chat.reportFailed', { reason: errorText(err) }));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Quiz generation
  const handleGenerateQuiz = async (content: string) => {
    try {
      const data = await api.generateQuiz(content);
      if (data.questions && data.questions.length > 0) {
        setQuizData({ questions: data.questions });
        setCurrentQuestionIndex(0);
        setSelectedAnswers(new Array(data.questions.length).fill(null));
        setShowFeedback(false);
        setQuizScore(0);
        setQuizFinished(false);
        setShowQuizModal(true);
      } else {
        alert(t('chat.quizNoQuestions'));
      }
    } catch (error) {
      console.error('Quiz generation error:', error);
      alert(t('chat.quizFailed', { reason: errorText(error) }));
    }
  };

  const handleQuizAnswer = (answerIndex: number) => {
    if (!quizData || selectedAnswers[currentQuestionIndex] !== null) return; // Already answered

    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
    setShowFeedback(true);

    // Update score if correct
    if (answerIndex === quizData.questions[currentQuestionIndex].answer_index) {
      setQuizScore(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowFeedback(selectedAnswers[currentQuestionIndex + 1] !== null);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setShowFeedback(selectedAnswers[currentQuestionIndex - 1] !== null);
    }
  };

  const handleFinishQuiz = () => {
    if (!quizData) return;
    setQuizFinished(true);

    // Persist the result server-side (stats page reads it back)
    api
      .postQuizResult({ score: quizScore, total: quizData.questions.length, subject: 'General' })
      .catch((err) => console.error('Failed to save quiz result:', err));
  };

  const handleCloseQuiz = () => {
    setShowQuizModal(false);
    setQuizData(null);
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setShowFeedback(false);
    setQuizScore(0);
    setQuizFinished(false);
  };


  return (
    <div className={`chat-exact ${nightMode ? 'night-mode' : ''}`}>
      <PillNav />
      <VerticalNav />

      {/* Knowledge Base document context banner */}
      {kbDocName && (
        <div className="kb-context-banner">
          <FileText size={16} weight="bold" />
          <span className="desktop-only">{t('chat.chattingWith')} <strong>{kbDocName}</strong></span>
          <span className="mobile-only">
            <strong>
              {kbDocName.split(' ').length > 3
                ? kbDocName.split(' ').slice(0, 3).join(' ') + '...'
                : kbDocName}
            </strong>
          </span>
          <button
            className="kb-context-clear"
            onClick={() => { setKbDocName(''); setDocumentId(null); router.replace('/screens/chat'); }}
            title={t('chat.clearDocument')}
            aria-label={t('chat.clearDocument')}
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${!sidebarCollapsed ? 'active' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />

      {/* Left Sidebar */}
      <div className={`sidebar-exact ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-collapse-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? t('chat.expandSidebar') : t('chat.collapseSidebar')}
        >
          {sidebarCollapsed ? <CaretRight size={20} weight="bold" /> : <CaretLeft size={20} weight="bold" />}
        </button>

        <button className="sidebar-btn" onClick={handleNewChat} title={t('chat.newChat')}>
          <Plus size={24} weight="bold" />
          {!sidebarCollapsed && <span className="sidebar-label">{t('chat.newChat')}</span>}
        </button>

        {!sidebarCollapsed && (
          <>


            <div className="sidebar-section">
              <h3 className="sidebar-section-title">{t('chat.recentChats')}</h3>
              <div className="sidebar-chat-list">
                {recentChats.slice(0, 3).map((c) => (
                  <button key={c.id} className="sidebar-chat-item" onClick={() => openConversation(c.id)}>
                    <ChatCircleDots size={20} />
                    <span>{c.title || t('chat.untitled')}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-section-title">{t('chat.favorites')}</h3>
              <div className="sidebar-chat-list">
                {recentChats.filter((c) => c.is_favorite).slice(0, 5).map((c) => (
                  <button key={c.id} className="sidebar-chat-item favorite" onClick={() => openConversation(c.id)}>
                    <Star size={20} weight="fill" />
                    <span>{c.title || t('chat.untitled')}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="sidebar-bottom">
          <Link href="/screens/knowledge-base" className="sidebar-btn" title={t('chat.knowledgeBase')}>
            <Books size={24} weight="bold" />
            {!sidebarCollapsed && <span className="sidebar-label">{t('chat.knowledgeBase')}</span>}
          </Link>

          <button className="sidebar-btn" onClick={() => setNightMode(!nightMode)} title={t('chat.nightMode')}>
            <Moon size={24} weight={nightMode ? 'fill' : 'regular'} />
            {!sidebarCollapsed && <span className="sidebar-label">{t('chat.nightMode')}</span>}
          </button>

          <Link href="/screens/history" className="sidebar-btn" title={t('chat.history')}>
            <ClockCounterClockwise size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">{t('chat.history')}</span>}
          </Link>
          <button className="sidebar-btn" title={t('chat.memories')}>
            <Database size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">{t('chat.memories')}</span>}
          </button>
        </div>
      </div>

      {/* Diagram Modal */}
      {showDiagramModal && (
        <div className="diagram-modal-overlay" onClick={() => setShowDiagramModal(false)}>
          <div className="diagram-modal" onClick={e => e.stopPropagation()}>
            <div className="diagram-modal-header">
              <h3 className="diagram-modal-title"><FlowArrow size={24} weight="bold" /> {t('chat.flowchartTitle')}</h3>
              <button className="diagram-modal-close" onClick={() => setShowDiagramModal(false)} title={t('common.close')}><X size={24} weight="bold" /></button>
            </div>
            <div className="diagram-modal-content"><MermaidDiagram chart={currentDiagram} /></div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="diagram-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="diagram-modal" onClick={e => e.stopPropagation()}>
            <div className="diagram-modal-header">
              <h3 className="diagram-modal-title"><FileDoc size={24} weight="bold" /> {t('chat.reportTitle')}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="diagram-modal-close"
                  onClick={handleDownloadPdf}
                  title={t('chat.downloadPdf')}
                  style={{ color: '#5b7cff', fontWeight: 600, display: 'flex', gap: '6px', padding: '6px 12px', background: 'rgba(91, 124, 255, 0.1)', borderRadius: '8px' }}
                >
                  <DownloadSimple size={20} weight="bold" /> {t('chat.downloadPdf')}
                </button>
                <button className="diagram-modal-close" onClick={() => setShowReportModal(false)} title={t('common.close')}><X size={24} weight="bold" /></button>
              </div>
            </div>
            <div className="diagram-modal-content" id="report-content-to-download" style={{ background: '#fff', padding: '24px' }}>
              <div className="report-content"><MarkdownMessage content={currentReport} isUser={false} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Session Analytics Modal */}
      {showSessionAnalytics && (
        <div className="diagram-modal-overlay" onClick={() => setShowSessionAnalytics(false)}>
          <div className="diagram-modal" onClick={e => e.stopPropagation()}>
            <div className="diagram-modal-header">
              <h3 className="diagram-modal-title"><ChartPie size={24} weight="bold" /> {t('chat.sessionAnalytics')}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="diagram-modal-close"
                  onClick={() => resetSession()}
                  title={t('chat.resetSession')}
                  style={{ color: '#ef4444', fontWeight: 600, display: 'flex', gap: '6px', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}
                >
                  <ArrowClockwise size={20} weight="bold" /> {t('chat.resetSession')}
                </button>
                <button className="diagram-modal-close" onClick={() => setShowSessionAnalytics(false)} title={t('common.close')}><X size={24} weight="bold" /></button>
              </div>
            </div>
            <div className="diagram-modal-content" style={{ background: '#fff', padding: '24px' }}>
              <div className="session-analytics-content">
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>{t('chat.currentSession')}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px' }}>{personaDisplayInfo.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: personaDisplayInfo.color }}>{personaDisplayInfo.name}</div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>{personaDisplayInfo.description}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                    <Timer size={16} style={{ marginRight: '4px' }} />
                    {t('chat.sessionDuration', { duration: elapsedMinutes < 60 ? t('chat.durationMinutes', { count: elapsedMinutes }) : t('chat.durationHoursMinutes', { hours: Math.floor(elapsedMinutes / 60), minutes: elapsedMinutes % 60 }) })}
                  </div>
                </div>
                <div className="analytics-summary">
                  <MarkdownMessage content={getSessionSummary()} isUser={false} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {showQuizModal && quizData && (
        <div className="diagram-modal-overlay" onClick={() => !quizFinished && handleCloseQuiz()}>
          <div className="quiz-modal" onClick={e => e.stopPropagation()}>
            <div className="quiz-modal-header">
              <h3 className="quiz-modal-title"><Exam size={24} weight="bold" /> {t('chat.quizTitle')}</h3>
              <button className="quiz-modal-close" onClick={handleCloseQuiz} title={t('common.close')}><X size={24} weight="bold" /></button>
            </div>
            <div className="quiz-modal-content">
              {!quizFinished ? (
                <>
                  <div className="quiz-question-number">
                    {t('chat.quizQuestion', { current: currentQuestionIndex + 1, total: quizData.questions.length })}
                  </div>
                  <div className="quiz-question-text">
                    {quizData.questions[currentQuestionIndex].question}
                  </div>
                  <div className="quiz-options">
                    {quizData.questions[currentQuestionIndex].options.map((option: string, idx: number) => {
                      const isSelected = selectedAnswers[currentQuestionIndex] === idx;
                      const isCorrect = idx === quizData.questions[currentQuestionIndex].answer_index;
                      const showResult = showFeedback && selectedAnswers[currentQuestionIndex] !== null;

                      let buttonClass = 'quiz-option-btn';
                      if (showResult) {
                        if (isSelected && isCorrect) buttonClass += ' correct';
                        else if (isSelected && !isCorrect) buttonClass += ' incorrect';
                        else if (isCorrect) buttonClass += ' correct-answer';
                      } else if (isSelected) {
                        buttonClass += ' selected';
                      }

                      return (
                        <button
                          key={idx}
                          className={buttonClass}
                          onClick={() => handleQuizAnswer(idx)}
                          disabled={selectedAnswers[currentQuestionIndex] !== null}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {showFeedback && selectedAnswers[currentQuestionIndex] !== null && (
                    <div className={`quiz-feedback ${selectedAnswers[currentQuestionIndex] === quizData.questions[currentQuestionIndex].answer_index ? 'correct' : 'incorrect'}`}>
                      <div className="quiz-feedback-title">
                        {selectedAnswers[currentQuestionIndex] === quizData.questions[currentQuestionIndex].answer_index ? t('chat.quizCorrect') : t('chat.quizIncorrect')}
                      </div>
                      <div className="quiz-feedback-text">
                        {quizData.questions[currentQuestionIndex].explanation}
                      </div>
                    </div>
                  )}
                  <div className="quiz-navigation">
                    <button
                      className="quiz-nav-btn"
                      onClick={handlePrevQuestion}
                      disabled={currentQuestionIndex === 0}
                    >
                      <CaretLeft size={20} weight="bold" /> {t('chat.quizPrevious')}
                    </button>
                    <div className="quiz-score">
                      {t('chat.quizScore', { score: quizScore, total: quizData.questions.length })}
                    </div>
                    {currentQuestionIndex < quizData.questions.length - 1 ? (
                      <button
                        className="quiz-nav-btn"
                        onClick={handleNextQuestion}
                        disabled={selectedAnswers[currentQuestionIndex] === null}
                      >
                        {t('chat.quizNext')} <CaretRight size={20} weight="bold" />
                      </button>
                    ) : (
                      <button
                        className="quiz-nav-btn quiz-finish-btn"
                        onClick={handleFinishQuiz}
                        disabled={selectedAnswers[currentQuestionIndex] === null}
                      >
                        {t('chat.quizFinish')}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="quiz-summary">
                  <div className="quiz-summary-icon">🎉</div>
                  <h3 className="quiz-summary-title">{t('chat.quizComplete')}</h3>
                  <div className="quiz-summary-score">
                    {quizScore} / {quizData.questions.length}
                  </div>
                  <div className="quiz-summary-percentage">
                    {Math.round((quizScore / quizData.questions.length) * 100)}%
                  </div>
                  <button className="quiz-close-btn" onClick={handleCloseQuiz}>
                    {t('common.close')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scroll-to-Bottom Button */}
      {showScrollButton && messages.length > 0 && (
        <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title={t('chat.scrollToBottom')}
          aria-label={t('chat.scrollToBottom')}>
          <CaretDown size={24} weight="bold" />
        </button>
      )}

      {/* Mobile Top Header */}
      <div className="mobile-chat-header mobile-only">
        <button className="mobile-header-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? <Stack size={20} weight="bold" /> : <X size={20} weight="bold" />}
        </button>
        <button className="mobile-header-btn" onClick={() => router.push('/screens/account')}>
          <User size={20} weight="bold" />
        </button>
      </div>

      {/* Main Area */}
      <div className="main-exact">
        {chatError && (
          <div role="alert" style={{ margin: '8px auto', padding: '10px 14px', maxWidth: 720, background: '#fee', border: '2px solid #c00', borderRadius: 8, color: '#c00', fontSize: 14, fontFamily: 'Sora, sans-serif', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{chatError}</span>
            <button onClick={() => setChatError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00' }} aria-label={t('common.dismiss')}><X size={14} weight="bold" /></button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="center-exact">
            <h1 className="greeting-exact">{t('chat.hello')}</h1>
            <p className="greeting-subtitle">{t('chat.subtitle')}</p>

            <div className="search-container">
              <div className="search-input-wrapper">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf,.pdf" onChange={handleFileChange} />
                {attachment && <AttachmentChip attachment={attachment} onRemove={handleRemoveFile} />}
                <button className="search-mic-btn desktop-only" onClick={handleToggleMic} title={t('chat.voiceInput')}><Microphone size={20} weight="bold" /></button>
                <textarea
                  className="search-textarea desktop-only"
                  placeholder={t('chat.placeholder')}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSubmit(e); } }}
                  rows={1}
                />
                <div className="search-actions desktop-only">
                  <button className="search-attach-btn" onClick={() => fileInputRef.current?.click()} title={t('chat.attachFile')}><Paperclip size={20} /></button>
                  <div className="adaptive-persona-display">
                    <div className="persona-indicator" style={{ color: personaDisplayInfo.color }}>
                      <span className="persona-icon">{personaDisplayInfo.icon}</span>
                      <span className="persona-name">{personaDisplayInfo.name}</span>
                    </div>
                    <div className="session-timer">
                      <Timer size={14} />
                      <span>{elapsedMinutes < 60 ? `${elapsedMinutes}min` : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}min`}</span>
                    </div>
                  </div>
                  <button className="search-submit-btn" onClick={() => { if (input.trim() || isRecording || attachment) handleSubmit(); }} title={t('chat.send')}><ArrowRight size={20} weight="bold" /></button>
                </div>

                <div className="mobile-bottom-row mobile-only" style={{ alignItems: 'center', width: '100%', gap: '8px' }}>
                  <div className="mobile-menu-wrapper">
                    <button className="mobile-icon-btn plus-btn" onClick={() => setShowPlusMenu(!showPlusMenu)} style={{ width: '32px', height: '32px', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={20} weight="bold" color="#1a1a1a" />
                    </button>
                    {showPlusMenu && (
                      <>
                        <div className="mobile-menu-overlay" onClick={() => setShowPlusMenu(false)} />
                        <div className="mobile-menu-popup left-popup">
                          <button className="mobile-menu-item" onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}><Paperclip size={20} /><span>{t('chat.attachFileMenu')}</span></button>
                          <div className="mobile-menu-divider" />
                          <button className="mobile-menu-item" onClick={() => { handleToggleMic(); setShowPlusMenu(false); }}><Microphone size={20} /><span>{t('chat.microphone')}</span></button>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    {isRecording ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600 }}>
                        <Waves size={24} className="animate-pulse" /> {t('chat.listening')}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="floating-input-field"
                        placeholder={t('chat.placeholderMobile')}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => { if (e.key === 'Enter' && input.trim()) { e.preventDefault(); handleSubmit(e); } }}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          fontSize: '16px',
                          outline: 'none',
                          color: '#1a1a1a',
                          padding: '0 4px'
                        }}
                      />
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(input.trim() || attachment || isRecording || ocrProcessing) ? (
                      <button className="mobile-submit-btn" disabled={isTyping || ocrProcessing} onClick={(e) => { handleSubmit(e); }} title={ocrProcessing ? t('chat.scanning') : t('chat.send')}>
                        {ocrProcessing ? '⏳' : <ArrowRight size={18} weight="bold" color="#fff" />}
                      </button>
                    ) : (
                      <div className="mobile-menu-wrapper">
                        <button className="mobile-icon-btn dot-btn" onClick={() => setShowMobileMenu(!showMobileMenu)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SquaresFour size={24} weight="bold" color="#666" />
                        </button>
                        {showMobileMenu && (
                          <>
                            <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)} />
                            <div className="mobile-menu-popup right-popup">
                              <div className="mobile-menu-label">{t('chat.currentPersona')}</div>
                              <div className="mobile-menu-item active">
                                <span className="persona-icon">{personaDisplayInfo.icon}</span>
                                <span>{personaDisplayInfo.name}</span>
                                <span className="persona-time">{elapsedMinutes < 60 ? `${elapsedMinutes}min` : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}min`}</span>
                              </div>
                              <div className="mobile-menu-divider" />
                              <button className="mobile-menu-item" onClick={() => { resetSession(); setShowMobileMenu(false); }}>
                                <ArrowClockwise size={20} />
                                <span>{t('chat.resetSession')}</span>
                              </button>
                              <button className="mobile-menu-item" onClick={() => { setShowSessionAnalytics(true); setShowMobileMenu(false); }}>
                                <ChartPie size={20} />
                                <span>{t('chat.studyMode')}</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="quick-start-section">
              <h3 className="quick-start-title">{t('chat.quickStart')}</h3>
              <div className="quick-start-grid">
                <button className="quick-card"><div className="quick-card-icon blue"><FileText size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">{t('chat.quick.summarizeTitle')}</h4><p className="quick-card-desc">{t('chat.quick.summarizeDesc')}</p></div></button>
                <button className="quick-card"><div className="quick-card-icon orange"><Lightbulb size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">{t('chat.quick.explainTitle')}</h4><p className="quick-card-desc">{t('chat.quick.explainDesc')}</p></div></button>
                <button className="quick-card"><div className="quick-card-icon green"><PencilSimple size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">{t('chat.quick.homeworkTitle')}</h4><p className="quick-card-desc">{t('chat.quick.homeworkDesc')}</p></div></button>
                <button className="quick-card"><div className="quick-card-icon purple"><Exam size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">{t('chat.quick.quizTitle')}</h4><p className="quick-card-desc">{t('chat.quick.quizDesc')}</p></div></button>
              </div>
            </div>

            <div className="popular-topics">
              <span className="popular-label">{t('chat.popular')}</span>
              <button className="topic-chip">{t('chat.topics.quantum')}</button>
              <button className="topic-chip">{t('chat.topics.ww2')}</button>
              <button className="topic-chip">{t('chat.topics.python')}</button>
              <button className="topic-chip">{t('chat.topics.macro')}</button>
            </div>
          </div>
        ) : (
          <div className="messages-exact" ref={messagesContainerRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-exact ${msg.role}`}>
                <div className="message-sidebar-left">
                  <div className="msg-avatar-exact">{msg.role === 'ai' ? 'V' : 'Y'}</div>
                  {msg.role === 'ai' && (
                    <div className="message-actions-left">
                      <button className="action-menu-btn" onClick={() => setShowActionMenu(showActionMenu === idx ? null : idx)} title={t('chat.moreActions')}>
                        <DotsThree size={24} weight="bold" color="#1a1a1a" />
                      </button>
                      <ActionMenu
                        isOpen={showActionMenu === idx}
                        messageIndex={idx}
                        messageContent={msg.content}
                        isSpeaking={isSpeaking === idx}
                        isGeneratingReport={isGeneratingReport}
                        onClose={() => setShowActionMenu(null)}
                        onGenerateFlowchart={handleGenerateFlowchart}
                        onGenerateReport={handleGenerateReport}
                        onGenerateQuiz={handleGenerateQuiz}
                        onToggleSpeech={handleToggleSpeech}
                      />
                    </div>
                  )}
                </div>
                <div className="msg-content-wrapper">
                  {msg.role === 'ai' && msg.content.length > 300 && (
                    <button className="message-collapse-btn" onClick={() => toggleMessageCollapse(idx)} title={collapsedMessages.has(idx) ? t('chat.expand') : t('chat.collapse')}>
                      {collapsedMessages.has(idx) ? <CaretDown size={14} weight="bold" /> : <CaretUp size={14} weight="bold" />}
                    </button>
                  )}
                  {msg.role === 'user' && msg.imageUrl && (
                    <div className="message-image"><img src={msg.imageUrl} alt={t('chat.uploadedImage')} className="message-image-preview" /></div>
                  )}
                  <div className={`msg-text-exact ${collapsedMessages.has(idx) ? 'collapsed' : ''}`}>
                    <MarkdownMessage content={msg.content} isUser={msg.role === 'user'} />
                    {msg.hasDiagram && msg.diagramCode && (
                      <button className="diagram-badge" onClick={() => { setCurrentDiagram(msg.diagramCode!); setShowDiagramModal(true); }} title={t('chat.viewFlowchart')}>
                        <FlowArrow size={16} weight="bold" /><span>{t('chat.viewDiagram')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="message-exact ai">
                <div className="msg-avatar-exact">V</div>
                <div className="msg-text-exact typing-indicator">
                  <Loader variant="default" size="sm" count={3} duration={0.6} delayStep={150} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating Input Area */}
        {messages.length > 0 && (
          <div className="floating-input-area">
            <div className="floating-input-wrapper">
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf,.pdf" onChange={handleFileChange} />
              {attachment && <AttachmentChip attachment={attachment} onRemove={handleRemoveFile} />}
              <button className={`floating-mic-btn desktop-only ${isRecording ? 'recording' : ''}`} onClick={handleToggleMic} title={isRecording ? t('chat.stopRecording') : t('chat.voiceInput')}>
                <Microphone size={20} weight={isRecording ? "fill" : "bold"} color={isRecording ? "#ef4444" : "currentColor"} className={isRecording ? "animate-pulse" : ""} />
              </button>
              <textarea
                className="floating-textarea desktop-only"
                placeholder={t('chat.placeholderShort')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSubmit(e); } }}
                rows={1}
              />
              <div className="floating-actions desktop-only">
                <button className="floating-attach-btn" onClick={() => fileInputRef.current?.click()} title={t('chat.attachFile')}><Paperclip size={20} /></button>
                <div className="floating-adaptive-persona">
                  <div className="persona-indicator" style={{ color: personaDisplayInfo.color }}>
                    <span className="persona-icon">{personaDisplayInfo.icon}</span>
                    <span className="persona-name">{personaDisplayInfo.name}</span>
                  </div>
                  <div className="session-timer">
                    <Timer size={14} />
                    <span>{elapsedMinutes < 60 ? `${elapsedMinutes}min` : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}min`}</span>
                  </div>
                </div>
                <button className="floating-submit-btn" disabled={isTyping || ocrProcessing} onClick={(e) => { if (input.trim() || attachment) handleSubmit(e); }} title={ocrProcessing ? t('chat.scanning') : t('chat.send')}>
                  {ocrProcessing ? '⏳' : <ArrowRight size={20} weight="bold" />}
                </button>
              </div>

              <div className="floating-bottom-row mobile-only" style={{ alignItems: 'center', width: '100%', gap: '8px' }}>
                <div className="mobile-menu-wrapper">
                  <button className="mobile-icon-btn plus-btn" onClick={() => setShowPlusMenu(!showPlusMenu)} style={{ width: '32px', height: '32px', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={20} weight="bold" color="#1a1a1a" />
                  </button>
                  {showPlusMenu && (
                    <>
                      <div className="mobile-menu-overlay" onClick={() => setShowPlusMenu(false)} />
                      <div className="mobile-menu-popup left-popup">
                        <button className="mobile-menu-item" onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}><Paperclip size={20} /><span>{t('chat.attachFileMenu')}</span></button>
                        <div className="mobile-menu-divider" />
                        <button className="mobile-menu-item" onClick={() => { handleToggleMic(); setShowPlusMenu(false); }}><Microphone size={20} /><span>{t('chat.microphone')}</span></button>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  {isRecording ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600 }}>
                      <Waves size={24} className="animate-pulse" /> {t('chat.listening')}
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="floating-input-field"
                      placeholder={t('chat.placeholderMobile')}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => { if (e.key === 'Enter' && input.trim()) { e.preventDefault(); handleSubmit(e); } }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '16px',
                        outline: 'none',
                        color: '#1a1a1a',
                        padding: '0 4px'
                      }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(input.trim() || attachment || isRecording || ocrProcessing) ? (
                    <button className="mobile-submit-btn" disabled={isTyping || ocrProcessing} onClick={(e) => { handleSubmit(e); }} title={ocrProcessing ? t('chat.scanning') : t('chat.send')}>
                      {ocrProcessing ? '⏳' : <ArrowRight size={18} weight="bold" color="#fff" />}
                    </button>
                  ) : (
                    <div className="mobile-menu-wrapper">
                      <button className="mobile-icon-btn dot-btn" onClick={() => setShowMobileMenu(!showMobileMenu)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SquaresFour size={24} weight="bold" color="#666" />
                      </button>
                      {showMobileMenu && (
                        <>
                          <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)} />
                          <div className="mobile-menu-popup right-popup">
                            <div className="mobile-menu-label">{t('chat.currentPersona')}</div>
                            <div className="mobile-menu-item active">
                              <span className="persona-icon">{personaDisplayInfo.icon}</span>
                              <span>{personaDisplayInfo.name}</span>
                              <span className="persona-time">{elapsedMinutes < 60 ? `${elapsedMinutes}min` : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}min`}</span>
                            </div>
                            <div className="mobile-menu-divider" />
                            <button className="mobile-menu-item" onClick={() => { resetSession(); setShowMobileMenu(false); }}>
                              <ArrowClockwise size={20} />
                              <span>{t('chat.resetSession')}</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { setShowSessionAnalytics(true); setShowMobileMenu(false); }}>
                              <ChartPie size={20} />
                              <span>{t('chat.studyMode')}</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <Chat />
    </ProtectedRoute>
  );
}
