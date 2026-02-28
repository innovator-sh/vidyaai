import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Plus, Database, Moon, ClockCounterClockwise, ChartPie, Waves, Gift, Paperclip, ArrowRight, FileText, Lightbulb, PencilSimple, Exam, CaretRight, CaretLeft, DotsThree, ChatCircleDots, Star, Microphone, X, Books, CaretDown, CaretUp, FolderOpen, PencilLine, FlowArrow, SpeakerHigh, Cards, FileDoc, Question, DownloadSimple } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { Loader } from '../../components/retroui/Loader';
import { Select } from '../../components/retroui/Select';
import VerticalNav from '../../components/VerticalNav';
import { useAuth } from '../../contexts/AuthContext';
import MarkdownMessage from '../../components/MarkdownMessage';
import dynamic from 'next/dynamic';

const MermaidDiagram = dynamic(() => import('../../components/MermaidDiagram'), {
  ssr: false,
});

interface Message {
  role: 'user' | 'ai';
  content: string;
  hasDiagram?: boolean;
  diagramCode?: string;
  imageUrl?: string;
}

export default function Chat() {
  const router = useRouter();
  const { user } = useAuth(); // for firebase_uid â€” needed to save chat history

  // Document context from Knowledge Base (docName query param)
  const [documentContext, setDocumentContext] = useState<string>('');
  const [kbDocName, setKbDocName] = useState<string>('');

  // Read Knowledge Base doc from URL query on mount
  useEffect(() => {
    if (router.isReady && router.query.docName) {
      const name = router.query.docName as string;
      setKbDocName(name);
      setDocumentContext(name); // used as RAG document context
    }
  }, [router.isReady, router.query.docName]);

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
  const [selectedMode, setSelectedMode] = useState('study-buddy');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [recentChats, setRecentChats] = useState<{ id: string; title: string }[]>([]);
  const [showActionMenu, setShowActionMenu] = useState<number | null>(null);
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [currentDiagram, setCurrentDiagram] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [currentReport, setCurrentReport] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set());
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Stop TTS when closing page
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleToggleSpeech = (text: string, idx: number) => {
    if (isSpeaking === idx) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
    } else {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
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

        const formData = new FormData();
        const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
        formData.append('file', audioBlob, `audio.${fileExt}`);

        try {
          const res = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.transcript) {
            resolve(data.transcript);
          } else {
            console.error(data.error);
            resolve(null);
          }
        } catch (e) {
          console.error('Translation error', e);
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
      alert('Could not access microphone.');
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

      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      const opt: any = {
        margin: 15,
        filename: 'VidyaAI_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(clone).save();

      // Cleanup
      document.body.removeChild(container);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    }
  };

  // Fetch top 3 recent chats for sidebar
  useEffect(() => {
    if (!user?.uid) return;
    fetch(`/api/history?firebase_uid=${encodeURIComponent(user.uid)}&limit=3`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.history) {
          setRecentChats(
            (data.history as any[]).slice(0, 3).map((h: any) => ({
              id: h.id || '',
              title: h.title || 'Chat Session',
            }))
          );
        }
      })
      .catch(() => { });
  }, [user?.uid]);


  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>, overrideInput?: string) => {
    e?.preventDefault();

    let textToSubmit = overrideInput !== undefined ? overrideInput : input;

    if (isRecording) {
      const transcript = await stopRecordingAndGetTranscript();
      if (transcript) {
        textToSubmit = textToSubmit ? textToSubmit + ' ' + transcript : transcript;
      }
    }

    if (!textToSubmit.trim() && !attachedFile) return;

    const userInput = textToSubmit;
    const imageFile = attachedFile;

    // Build display content for the user's message
    const displayContent = imageFile
      ? `${userInput}${userInput ? '\n' : ''}ðŸ“Ž ${imageFile.name}`
      : userInput;

    setMessages(prev => [...prev, { role: 'user', content: displayContent }]);
    setInput('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsTyping(true);

    try {
      let effectiveDocumentContext = documentContext || undefined;

      if (imageFile) {
        setOcrProcessing(true);
        try {
          // Convert image to base64 for Groq Vision API
          const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]); // strip data URL prefix
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });

          const mimeType = imageFile.type || 'image/jpeg';

          // Call Groq Vision API directly from the browser
          const visionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY || ''}`,
            },
            body: JSON.stringify({
              model: 'meta-llama/llama-4-scout-17b-16e-instruct',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${base64Image}` },
                    },
                    {
                      type: 'text',
                      text: userInput
                        ? `The user asked: "${userInput}". Analyze the image in detail and answer their question. If the image contains handwritten or printed text, equations, or diagrams, extract and explain them all.`
                        : 'Analyze this image in detail. Extract all readable text (handwritten or printed), equations, diagrams, or visual content. Describe what you see clearly and completely.',
                    },
                  ],
                },
              ],
              temperature: 0.4,
              max_tokens: 1024,
            }),
          });

          if (visionRes.ok) {
            const visionData = await visionRes.json();
            const visionText = visionData.choices?.[0]?.message?.content || '';
            if (visionText) {
              setIsTyping(false);
              setOcrProcessing(false);
              setMessages(prev => [...prev, { role: 'ai', content: visionText }]);
              // Save Q&A to backend history via proxy (no CORS)
              if (user?.uid) {
                fetch('/api/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    firebase_uid: user.uid,
                    question: (userInput || imageFile.name).slice(0, 400),
                    answer: visionText.slice(0, 400),
                    subject: 'General',
                  }),
                }).catch(() => { });
              }

              return;
            }
          } else {
            console.warn('[Vision] Groq Vision failed:', visionRes.status, await visionRes.text());
          }
        } catch (visionErr) {
          console.warn('[Vision] Groq Vision error:', visionErr);
        } finally {
          setOcrProcessing(false);
        }
      }

      // Call the chat API endpoint, passing documentContext if set (from Knowledge Base or OCR)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput || 'Please analyze and explain the contents of the attached image in detail.',
          mode: selectedMode,
          conversationHistory: messages,
          documentContext: effectiveDocumentContext,
          firebase_uid: user?.uid || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      setIsTyping(false);

      // Check if response should include a diagram
      const shouldHaveDiagram = checkForDiagramKeywords(userInput);

      if (shouldHaveDiagram) {
        const diagramCode = generateMermaidDiagram(userInput);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: data.response || 'Here\'s a diagram to help visualize this concept:',
          hasDiagram: true,
          diagramCode: diagramCode
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          content: data.response || 'I understand your question. Let me help you with that.',
        }]);
      }
    } catch (error) {
      console.error('Error calling chat API:', error);
      setIsTyping(false);

      // Fallback to local response
      const diagramCode = generateMermaidDiagram(userInput);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: 'Here\'s a diagram to help visualize this concept:',
        hasDiagram: true,
        diagramCode: diagramCode
      }]);
    }
  };

  const checkForDiagramKeywords = (input: string): boolean => {
    const lowerInput = input.toLowerCase();
    const diagramKeywords = [
      'diagram', 'flowchart', 'process', 'flow', 'steps',
      'class', 'object', 'inheritance', 'sequence', 'interaction',
      'state', 'lifecycle', 'pie', 'distribution', 'percentage',
      'git', 'branch', 'database', 'entity', 'relationship', 'visualize'
    ];
    return diagramKeywords.some(keyword => lowerInput.includes(keyword));
  };

  const generateMermaidDiagram = (input: string): string => {
    const lowerInput = input.toLowerCase();

    // Flowchart examples
    if (lowerInput.includes('process') || lowerInput.includes('flow') || lowerInput.includes('steps')) {
      return `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process 1]
    B -->|No| D[Process 2]
    C --> E[End]
    D --> E`;
    }

    // Class diagram
    if (lowerInput.includes('class') || lowerInput.includes('object') || lowerInput.includes('inheritance')) {
      return `classDiagram
    Animal <|-- Dog
    Animal <|-- Cat
    Animal : +String name
    Animal : +int age
    Animal : +makeSound()
    Dog : +String breed
    Dog : +bark()
    Cat : +String color
    Cat : +meow()`;
    }

    // Sequence diagram
    if (lowerInput.includes('sequence') || lowerInput.includes('interaction') || lowerInput.includes('communication')) {
      return `sequenceDiagram
    participant User
    participant System
    participant Database
    User->>System: Request Data
    System->>Database: Query
    Database-->>System: Return Results
    System-->>User: Display Data`;
    }

    // State diagram
    if (lowerInput.includes('state') || lowerInput.includes('lifecycle')) {
      return `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Success: Complete
    Processing --> Error: Fail
    Success --> [*]
    Error --> Idle: Retry`;
    }

    // Pie chart
    if (lowerInput.includes('pie') || lowerInput.includes('distribution') || lowerInput.includes('percentage')) {
      return `pie title Study Time Distribution
    "Mathematics" : 30
    "Physics" : 25
    "Chemistry" : 20
    "Biology" : 15
    "Computer Science" : 10`;
    }

    // Git graph
    if (lowerInput.includes('git') || lowerInput.includes('branch') || lowerInput.includes('version')) {
      return `gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit`;
    }

    // Entity Relationship
    if (lowerInput.includes('database') || lowerInput.includes('entity') || lowerInput.includes('relationship')) {
      return `erDiagram
    STUDENT ||--o{ ENROLLMENT : enrolls
    STUDENT {
        string name
        int id
        string email
    }
    COURSE ||--o{ ENROLLMENT : includes
    COURSE {
        string title
        int code
        int credits
    }
    ENROLLMENT {
        date enrollDate
        string grade
    }`;
    }

    // Default flowchart
    return `graph LR
    A[Input: ${input.substring(0, 20)}...] --> B[Processing]
    B --> C[Analysis]
    C --> D[Result]
    D --> E[Output]`;
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setAttachedFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setImagePreviewUrl(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setImagePreviewUrl(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setImagePreviewUrl(null);
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
      const response = await fetch('/api/generate-flowchart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed');
      const data = await response.json();
      setMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, hasDiagram: true, diagramCode: data.mermaidCode } : m
      ));
      setCurrentDiagram(data.mermaidCode);
      setShowDiagramModal(true);
    } catch {
      alert('Failed to generate flowchart. Please try again.');
    }
  };

  // Report generation
  const handleGenerateReport = async (content: string) => {
    setIsGeneratingReport(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed');
      const data = await response.json();
      setCurrentReport(data.report);
      setShowReportModal(true);
    } catch {
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };


  return (
    <div className={`chat-exact ${nightMode ? 'night-mode' : ''}`}>
      <PillNav />
      <VerticalNav />

      {/* Knowledge Base document context banner */}
      {kbDocName && (
        <div className="kb-context-banner">
          <FileText size={16} weight="bold" />
          <span>Chatting with: <strong>{kbDocName}</strong></span>
          <button
            className="kb-context-clear"
            onClick={() => { setKbDocName(''); setDocumentContext(''); router.replace('/screens/chat'); }}
            title="Clear document context"
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
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? <CaretRight size={20} weight="bold" /> : <CaretLeft size={20} weight="bold" />}
        </button>

        <button className="sidebar-btn" onClick={handleNewChat} title="New Chat">
          <Plus size={24} weight="bold" />
          {!sidebarCollapsed && <span className="sidebar-label">New Chat</span>}
        </button>

        {!sidebarCollapsed && (
          <>
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">RECENT CHATS</h3>
              <div className="sidebar-chat-list">
                {recentChats.length > 0 ? (
                  recentChats.map(chat => (
                    <button
                      key={chat.id}
                      className="sidebar-chat-item"
                      onClick={() => router.push('/screens/history')}
                      title={chat.title}
                    >
                      <ChatCircleDots size={20} />
                      <span>{chat.title.length > 22 ? chat.title.slice(0, 22) + 'â€¦' : chat.title}</span>
                    </button>
                  ))
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 8px' }}>No chats yet</p>
                )}
              </div>
            </div>

            <div className="sidebar-section">
              <button className="sidebar-section-header" onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}>
                <div className="sidebar-section-header-left">
                  <Books size={18} weight="bold" />
                  <h3 className="sidebar-section-title">KNOWLEDGE BASE</h3>
                </div>
                {showKnowledgeBase ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
              </button>
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-section-title">FAVORITES</h3>
              <div className="sidebar-chat-list">
                <button className="sidebar-chat-item favorite"><Star size={20} weight="fill" /><span>Bio Notes: Mitosis</span></button>
                <button className="sidebar-chat-item favorite"><Star size={20} weight="fill" /><span>Organic Chem Formulas</span></button>
              </div>
            </div>
          </>
        )}

        <div className="sidebar-bottom">
          <a href="/screens/knowledge-base" className="sidebar-btn" title="Knowledge Base">
            <Books size={24} weight="bold" />
            {!sidebarCollapsed && <span className="sidebar-label">Knowledge Base</span>}
          </a>
          <button className="sidebar-btn" title="Memories">
            <Database size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">Memories</span>}
          </button>
          <button className="sidebar-btn" onClick={() => setNightMode(!nightMode)} title="Night Mode">
            <Moon size={24} weight={nightMode ? 'fill' : 'regular'} />
            {!sidebarCollapsed && <span className="sidebar-label">Night Mode</span>}
          </button>
          <a href="/screens/history" className="sidebar-btn" title="History">
            <ClockCounterClockwise size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">History</span>}
          </a>
        </div>
      </div>

      {/* Diagram Modal */}
      {showDiagramModal && (
        <div className="diagram-modal-overlay" onClick={() => setShowDiagramModal(false)}>
          <div className="diagram-modal" onClick={e => e.stopPropagation()}>
            <div className="diagram-modal-header">
              <h3 className="diagram-modal-title"><FlowArrow size={24} weight="bold" /> Flowchart Diagram</h3>
              <button className="diagram-modal-close" onClick={() => setShowDiagramModal(false)} title="Close"><X size={24} weight="bold" /></button>
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
              <h3 className="diagram-modal-title"><FileDoc size={24} weight="bold" /> Summary Report</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="diagram-modal-close"
                  onClick={handleDownloadPdf}
                  title="Download as PDF"
                  style={{ color: '#5b7cff', fontWeight: 600, display: 'flex', gap: '6px', padding: '6px 12px', background: 'rgba(91, 124, 255, 0.1)', borderRadius: '8px' }}
                >
                  <DownloadSimple size={20} weight="bold" /> Download PDF
                </button>
                <button className="diagram-modal-close" onClick={() => setShowReportModal(false)} title="Close"><X size={24} weight="bold" /></button>
              </div>
            </div>
            <div className="diagram-modal-content" id="report-content-to-download" style={{ background: '#fff', padding: '24px' }}>
              <div className="report-content"><MarkdownMessage content={currentReport} isUser={false} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Scroll-to-Bottom Button */}
      {showScrollButton && messages.length > 0 && (
        <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title="Scroll to bottom">
          <CaretDown size={24} weight="bold" />
        </button>
      )}

      {/* Main Area */}
      <div className="main-exact">
        {messages.length === 0 ? (
          <div className="center-exact">
            <h1 className="greeting-exact">Hello! Ready to study?</h1>
            <p className="greeting-subtitle">Choose a quick action below or ask your own question.</p>

            <div className="search-container">
              <div className="search-input-wrapper">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/png,image/jpeg,image/jpg" onChange={handleFileChange} />
                {attachedFile && (
                  <div className="file-indicator">
                    <Paperclip size={14} weight="bold" />
                    <span className="file-name">{attachedFile.name}</span>
                    <button className="file-remove-btn" onClick={handleRemoveFile} title="Remove file"><X size={14} weight="bold" /></button>
                  </div>
                )}
                <button className="search-mic-btn" onClick={() => console.log('Voice input')} title="Voice input"><Microphone size={20} weight="bold" /></button>
                <textarea
                  className="search-textarea"
                  placeholder="Ask anything or upload a file..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSubmit(e as any); } }}
                  rows={1}
                />
                <div className="search-actions">
                  <button className="search-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file"><Paperclip size={20} /></button>
                  <div className="mode-selector-wrapper">
                    <Select value={selectedMode} onValueChange={setSelectedMode}>
                      <Select.Trigger className="mode-selector-trigger icon-only">
                        <img src={`/${selectedMode}.svg`} alt={selectedMode} className="mode-selector-icon" />
                      </Select.Trigger>
                      <Select.Content className="mode-selector-content">
                        <Select.Item value="study-buddy" className="mode-selector-item"><div className="mode-option"><img src="/study-buddy.svg" alt="" className="mode-option-icon" /><span>Study Buddy</span></div></Select.Item>
                        <Select.Separator className="mode-separator" />
                        <Select.Item value="teacher" className="mode-selector-item"><div className="mode-option"><img src="/teacher.svg" alt="" className="mode-option-icon" /><span>Teacher</span></div></Select.Item>
                        <Select.Separator className="mode-separator" />
                        <Select.Item value="mentor" className="mode-selector-item"><div className="mode-option"><img src="/mentor.svg" alt="" className="mode-option-icon" /><span>Mentor</span></div></Select.Item>
                      </Select.Content>
                    </Select>
                  </div>
                  <button className="search-submit-btn" onClick={(e) => { if (input.trim() || isRecording) handleSubmit(); }} title="Send message"><ArrowRight size={20} weight="bold" /></button>
                </div>
              </div>
            </div>

            <div className="quick-start-section">
              <h3 className="quick-start-title">QUICK START</h3>
              <div className="quick-start-grid">
                <button className="quick-card"><div className="quick-card-icon blue"><FileText size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">Summarize my notes</h4><p className="quick-card-desc">Turn long lectures into concise bullet points.</p></div></button>
                <button className="quick-card"><div className="quick-card-icon orange"><Lightbulb size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">Explain a concept</h4><p className="quick-card-desc">Break down complex topics into simple terms.</p></div></button>
                <button className="quick-card"><div className="quick-card-icon green"><PencilSimple size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">Help with homework</h4><p className="quick-card-desc">Step-by-step guidance for difficult problems.</p></div></button>
                <button className="quick-card"><div className="quick-card-icon purple"><Exam size={24} weight="bold" /></div><div className="quick-card-content"><h4 className="quick-card-title">Prepare for a quiz</h4><p className="quick-card-desc">Generate practice questions and flashcards.</p></div></button>
              </div>
            </div>

            <div className="popular-topics">
              <span className="popular-label">Popular:</span>
              <button className="topic-chip">Quantum Physics</button>
              <button className="topic-chip">World War II</button>
              <button className="topic-chip">Python Basics</button>
              <button className="topic-chip">Macroeconomics</button>
            </div>
          </div>
        ) : (
          <div className="messages-exact" ref={messagesContainerRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-exact ${msg.role}`}>
                {msg.role === 'ai' && (
                  <div className="message-actions-left">
                    <button className="action-menu-btn" onClick={() => setShowActionMenu(showActionMenu === idx ? null : idx)} title="More actions">
                      <Plus size={16} weight="bold" />
                    </button>
                    {showActionMenu === idx && (
                      <>
                        <div className="action-menu-overlay" onClick={() => setShowActionMenu(null)} />
                        <div className="action-menu">
                          <button className="action-menu-item" onClick={() => { handleGenerateFlowchart(msg.content, idx); setShowActionMenu(null); }}>
                            <FlowArrow size={18} weight="bold" /><span>Generate Flowchart</span>
                          </button>
                          <button className="action-menu-item" onClick={() => { handleGenerateReport(msg.content); setShowActionMenu(null); }} disabled={isGeneratingReport}>
                            <FileDoc size={18} weight="bold" /><span>{isGeneratingReport ? 'Generatingâ€¦' : 'Generate Report'}</span>
                          </button>
                          <button className="action-menu-item" onClick={() => { handleToggleSpeech(msg.content, idx); setShowActionMenu(null); }}>
                            <SpeakerHigh size={18} weight={isSpeaking === idx ? "fill" : "bold"} />
                            <span>{isSpeaking === idx ? 'Stop Audio' : 'Read Aloud'}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="msg-avatar-exact">{msg.role === 'ai' ? 'V' : 'Y'}</div>
                <div className="msg-content-wrapper">
                  {msg.role === 'ai' && msg.content.length > 300 && (
                    <button className="message-collapse-btn" onClick={() => toggleMessageCollapse(idx)} title={collapsedMessages.has(idx) ? 'Expand' : 'Collapse'}>
                      {collapsedMessages.has(idx) ? <CaretDown size={14} weight="bold" /> : <CaretUp size={14} weight="bold" />}
                    </button>
                  )}
                  {msg.role === 'user' && msg.imageUrl && (
                    <div className="message-image"><img src={msg.imageUrl} alt="Uploaded" className="message-image-preview" /></div>
                  )}
                  <div className={`msg-text-exact ${collapsedMessages.has(idx) ? 'collapsed' : ''}`}>
                    <MarkdownMessage content={msg.content} isUser={msg.role === 'user'} />
                    {msg.hasDiagram && msg.diagramCode && (
                      <button className="diagram-badge" onClick={() => { setCurrentDiagram(msg.diagramCode!); setShowDiagramModal(true); }} title="View flowchart">
                        <FlowArrow size={16} weight="bold" /><span>View Diagram</span>
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
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/png,image/jpeg,image/jpg" onChange={handleFileChange} />
              {attachedFile && (
                <div className="file-indicator">
                  <Paperclip size={14} weight="bold" />
                  <span className="file-name">{attachedFile.name}</span>
                  <button className="file-remove-btn" onClick={handleRemoveFile} title="Remove file"><X size={14} weight="bold" /></button>
                </div>
              )}
              <button className={`floating-mic-btn ${isRecording ? 'recording' : ''}`} onClick={handleToggleMic} title={isRecording ? 'Stop recording' : 'Voice input'}>
                <Microphone size={20} weight={isRecording ? "fill" : "bold"} color={isRecording ? "#ef4444" : "currentColor"} className={isRecording ? "animate-pulse" : ""} />
              </button>
              <textarea
                className="floating-textarea"
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSubmit(e as any); } }}
                rows={1}
              />
              <div className="floating-actions">
                <button className="floating-attach-btn desktop-only" onClick={() => fileInputRef.current?.click()} title="Attach file"><Paperclip size={20} /></button>
                <div className="floating-mode-selector desktop-only">
                  <Select value={selectedMode} onValueChange={setSelectedMode}>
                    <Select.Trigger className="floating-mode-trigger icon-only">
                      <img src={`/${selectedMode}.svg`} alt={selectedMode} className="mode-selector-icon" />
                    </Select.Trigger>
                    <Select.Content className="mode-selector-content">
                      <Select.Item value="study-buddy" className="mode-selector-item"><div className="mode-option"><img src="/study-buddy.svg" alt="" className="mode-option-icon" /><span>Study Buddy</span></div></Select.Item>
                      <Select.Separator className="mode-separator" />
                      <Select.Item value="teacher" className="mode-selector-item"><div className="mode-option"><img src="/teacher.svg" alt="" className="mode-option-icon" /><span>Teacher</span></div></Select.Item>
                      <Select.Separator className="mode-separator" />
                      <Select.Item value="mentor" className="mode-selector-item"><div className="mode-option"><img src="/mentor.svg" alt="" className="mode-option-icon" /><span>Mentor</span></div></Select.Item>
                    </Select.Content>
                  </Select>
                </div>
                <div className="mobile-menu-wrapper mobile-only">
                  <button className="mobile-menu-btn" onClick={() => setShowMobileMenu(!showMobileMenu)} title="Options"><DotsThree size={24} weight="bold" /></button>
                  {showMobileMenu && (
                    <>
                      <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)} />
                      <div className="mobile-menu-popup">
                        <button className="mobile-menu-item" onClick={() => { fileInputRef.current?.click(); setShowMobileMenu(false); }}><Paperclip size={20} /><span>Attach File</span></button>
                        <div className="mobile-menu-divider" />
                        <div className="mobile-menu-label">Change Mode</div>
                        <button className={`mobile-menu-item ${selectedMode === 'study-buddy' ? 'active' : ''}`} onClick={() => { setSelectedMode(''); setShowMobileMenu(false); }}><img src="/study-buddy.svg" alt="" className="mobile-menu-icon" /><span>Study Buddy</span></button>
                        <button className={`mobile-menu-item ${selectedMode === 'teacher' ? 'active' : ''}`} onClick={() => { setSelectedMode('teacher'); setShowMobileMenu(false); }}><img src="/teacher.svg" alt="" className="mobile-menu-icon" /><span>Teacher</span></button>
                        <button className={`mobile-menu-item ${selectedMode === 'mentor' ? 'active' : ''}`} onClick={() => { setSelectedMode('mentor'); setShowMobileMenu(false); }}><img src="/mentor.svg" alt="" className="mobile-menu-icon" /><span>Mentor</span></button>
                      </div>
                    </>
                  )}
                </div>
                <button className="floating-submit-btn" disabled={isTyping || ocrProcessing} onClick={(e) => { if (input.trim() || attachedFile) handleSubmit(e as any); }} title={ocrProcessing ? 'Scanning image...' : 'Send message'}>
                  {ocrProcessing ? 'â³' : <ArrowRight size={20} weight="bold" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
