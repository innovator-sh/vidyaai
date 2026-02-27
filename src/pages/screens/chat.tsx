import { useState, useRef } from 'react';
import { Plus, Database, Moon, ClockCounterClockwise, ChartPie, Waves, Gift, Paperclip, ArrowRight, FileText, Lightbulb, PencilSimple, Exam, CaretRight, CaretLeft, DotsThree, ChatCircleDots, Star } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { Loader } from '../../components/retroui/Loader';
import { Select } from '../../components/retroui/Select';
import dynamic from 'next/dynamic';

const MermaidDiagram = dynamic(() => import('../../components/MermaidDiagram'), {
  ssr: false,
});

interface Message {
  role: 'user' | 'ai';
  content: string;
  hasDiagram?: boolean;
  diagramCode?: string;
}

export default function Chat() {

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim()) {
      const userInput = input;
      setMessages([...messages, { role: 'user', content: userInput }]);
      setInput('');
      setIsTyping(true);
      
      try {
        // Call the chat API endpoint
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userInput,
            mode: selectedMode,
            conversationHistory: messages,
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
  };

  return (
    <div className={`chat-exact ${nightMode ? 'night-mode' : ''}`}>
      <PillNav />

      {/* Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${!sidebarCollapsed ? 'active' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />

      {/* Left Sidebar */}
      <div className={`sidebar-exact ${sidebarCollapsed ? 'collapsed' : ''}`}>
        
        {/* Collapse Toggle at Top */}
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
            {/* Recent Chats Section */}
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">RECENT CHATS</h3>
              <div className="sidebar-chat-list">
                <button className="sidebar-chat-item">
                  <ChatCircleDots size={20} />
                  <span>Calculus 101: Integrals</span>
                </button>
                <button className="sidebar-chat-item">
                  <ChatCircleDots size={20} />
                  <span>History: Industrial Rev</span>
                </button>
                <button className="sidebar-chat-item">
                  <ChatCircleDots size={20} />
                  <span>English Essay Outline</span>
                </button>
              </div>
            </div>

            {/* Favorites Section */}
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">FAVORITES</h3>
              <div className="sidebar-chat-list">
                <button className="sidebar-chat-item favorite">
                  <Star size={20} weight="fill" />
                  <span>Bio Notes: Mitosis</span>
                </button>
                <button className="sidebar-chat-item favorite">
                  <Star size={20} weight="fill" />
                  <span>Organic Chem Formulas</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Bottom Actions */}
        <div className="sidebar-bottom">
          <button className="sidebar-btn" title="Memories">
            <Database size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">Memories</span>}
          </button>
          
          <button 
            className="sidebar-btn" 
            onClick={() => setNightMode(!nightMode)}
            title="Night Mode"
          >
            <Moon size={24} weight={nightMode ? 'fill' : 'regular'} />
            {!sidebarCollapsed && <span className="sidebar-label">Night Mode</span>}
          </button>
          
          <a 
            href="/screens/history"
            className="sidebar-btn" 
            title="History"
          >
            <ClockCounterClockwise size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">History</span>}
          </a>
        </div>
      </div>

      {/* Main Area */}
      <div className="main-exact">

        {/* Center Content */}
        {messages.length === 0 ? (
          <div className="center-exact">
            
            <h1 className="greeting-exact">
              Hello! Ready to study?
            </h1>
            <p className="greeting-subtitle">
              Choose a quick action below or ask your own question.
            </p>

            {/* Search Input */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <textarea
                  className="search-textarea"
                  placeholder="Ask anything or upload a file..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                      e.preventDefault();
                      handleSubmit(e as any);
                    }
                  }}
                  rows={1}
                />
                <div className="search-actions">
                  <button 
                    className="search-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                  >
                    <Paperclip size={20} />
                  </button>
                  
                  <div className="mode-selector-wrapper">
                    <Select value={selectedMode} onValueChange={setSelectedMode}>
                      <Select.Trigger className="mode-selector-trigger">
                        <div className="mode-selector-display">
                          <img 
                            src={`/${selectedMode}.svg`} 
                            alt={selectedMode} 
                            className="mode-selector-icon" 
                          />
                          <span className="mode-selector-text">
                            {selectedMode === 'study-buddy' ? 'Study Buddy' : 
                             selectedMode === 'teacher' ? 'Teacher' : 'Mentor'}
                          </span>
                        </div>
                      </Select.Trigger>
                      <Select.Content className="mode-selector-content">
                        <Select.Item value="study-buddy" className="mode-selector-item">
                          <div className="mode-option">
                            <img src="/study-buddy.svg" alt="" className="mode-option-icon" />
                            <span>Study Buddy</span>
                          </div>
                        </Select.Item>
                        <Select.Separator className="mode-separator" />
                        <Select.Item value="teacher" className="mode-selector-item">
                          <div className="mode-option">
                            <img src="/teacher.svg" alt="" className="mode-option-icon" />
                            <span>Teacher</span>
                          </div>
                        </Select.Item>
                        <Select.Separator className="mode-separator" />
                        <Select.Item value="mentor" className="mode-selector-item">
                          <div className="mode-option">
                            <img src="/mentor.svg" alt="" className="mode-option-icon" />
                            <span>Mentor</span>
                          </div>
                        </Select.Item>
                      </Select.Content>
                    </Select>
                  </div>

                  <button 
                    className="search-submit-btn"
                    onClick={(e) => {
                      if (input.trim()) {
                        handleSubmit(e as any);
                      }
                    }}
                    title="Send message"
                  >
                    <ArrowRight size={20} weight="bold" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Start Cards */}
            <div className="quick-start-section">
              <h3 className="quick-start-title">QUICK START</h3>
              <div className="quick-start-grid">
                <button className="quick-card">
                  <div className="quick-card-icon blue">
                    <FileText size={24} weight="bold" />
                  </div>
                  <div className="quick-card-content">
                    <h4 className="quick-card-title">Summarize my notes</h4>
                    <p className="quick-card-desc">Turn long lectures into concise bullet points.</p>
                  </div>
                </button>

                <button className="quick-card">
                  <div className="quick-card-icon orange">
                    <Lightbulb size={24} weight="bold" />
                  </div>
                  <div className="quick-card-content">
                    <h4 className="quick-card-title">Explain a concept</h4>
                    <p className="quick-card-desc">Break down complex topics into simple terms.</p>
                  </div>
                </button>

                <button className="quick-card">
                  <div className="quick-card-icon green">
                    <PencilSimple size={24} weight="bold" />
                  </div>
                  <div className="quick-card-content">
                    <h4 className="quick-card-title">Help with homework</h4>
                    <p className="quick-card-desc">Step-by-step guidance for difficult problems.</p>
                  </div>
                </button>

                <button className="quick-card">
                  <div className="quick-card-icon purple">
                    <Exam size={24} weight="bold" />
                  </div>
                  <div className="quick-card-content">
                    <h4 className="quick-card-title">Prepare for a quiz</h4>
                    <p className="quick-card-desc">Generate practice questions and flashcards.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Popular Topics */}
            <div className="popular-topics">
              <span className="popular-label">Popular:</span>
              <button className="topic-chip">Quantum Physics</button>
              <button className="topic-chip">World War II</button>
              <button className="topic-chip">Python Basics</button>
              <button className="topic-chip">Macroeconomics</button>
            </div>
          </div>
        ) : (
          <div className="messages-exact">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-exact ${msg.role}`}>
                <div className="msg-avatar-exact">{msg.role === 'ai' ? 'V' : 'Y'}</div>
                <div className="msg-text-exact">
                  {msg.content}
                  {msg.hasDiagram && msg.diagramCode && (
                    <div className="diagram-wrapper">
                      <MermaidDiagram chart={msg.diagramCode} />
                    </div>
                  )}
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
          </div>
        )}

        {/* Floating Input Area - Shows when messages exist */}
        {messages.length > 0 && (
          <div className="floating-input-area">
            <div className="floating-input-wrapper">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
              />
              <textarea
                className="floating-textarea"
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
                rows={1}
              />
              <div className="floating-actions">
                <button 
                  className="floating-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip size={20} />
                </button>
                
                <div className="floating-mode-selector">
                  <Select value={selectedMode} onValueChange={setSelectedMode}>
                    <Select.Trigger className="floating-mode-trigger">
                      <div className="mode-selector-display">
                        <img 
                          src={`/${selectedMode}.svg`} 
                          alt={selectedMode} 
                          className="mode-selector-icon" 
                        />
                        <span className="mode-selector-text">
                          {selectedMode === 'study-buddy' ? 'Study Buddy' : 
                           selectedMode === 'teacher' ? 'Teacher' : 'Mentor'}
                        </span>
                      </div>
                    </Select.Trigger>
                    <Select.Content className="mode-selector-content">
                      <Select.Item value="study-buddy" className="mode-selector-item">
                        <div className="mode-option">
                          <img src="/study-buddy.svg" alt="" className="mode-option-icon" />
                          <span>Study Buddy</span>
                        </div>
                      </Select.Item>
                      <Select.Separator className="mode-separator" />
                      <Select.Item value="teacher" className="mode-selector-item">
                        <div className="mode-option">
                          <img src="/teacher.svg" alt="" className="mode-option-icon" />
                          <span>Teacher</span>
                        </div>
                      </Select.Item>
                      <Select.Separator className="mode-separator" />
                      <Select.Item value="mentor" className="mode-selector-item">
                        <div className="mode-option">
                          <img src="/mentor.svg" alt="" className="mode-option-icon" />
                          <span>Mentor</span>
                        </div>
                      </Select.Item>
                    </Select.Content>
                  </Select>
                </div>

                <button 
                  className="floating-submit-btn"
                  onClick={(e) => {
                    if (input.trim()) {
                      handleSubmit(e as any);
                    }
                  }}
                  title="Send message"
                >
                  <ArrowRight size={20} weight="bold" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Input */}
        {/* <div className="input-area-exact">
          <div className="top-row-exact">
            <div className="chips-exact">
              <button className="chip-exact yellow">
                <Waves size={18} weight="bold" />
                <span>Simplify</span>
              </button>
              <button className="chip-exact cyan">
                <ChartPie size={18} weight="bold" />
                <span>Diagram</span>
              </button>
            </div>
            <button className="gift-btn-exact">
              <Gift size={24} weight="bold" />
            </button>
          </div>

          <div className="input-row-exact">
            <div className="input-container-exact">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
              />
              <button 
                className="plus-btn-exact"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={24} weight="bold" />
              </button>
              <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="text"
                  className="text-input-exact"
                  placeholder="Ask me anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </form>
              <div className="mode-select-wrapper">
                <Select value={selectedMode} onValueChange={setSelectedMode}>
                  <Select.Trigger className="mode-select-trigger">
                    <img 
                      src={`/${selectedMode}.svg`} 
                      alt={selectedMode} 
                      className="mode-select-trigger-icon" 
                    />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="study-buddy">
                      <div className="mode-select-item">
                        <img src="/study-buddy.svg" alt="" className="mode-select-icon" />
                        <span>Study Buddy</span>
                      </div>
                    </Select.Item>
                    <Select.Item value="teacher">
                      <div className="mode-select-item">
                        <img src="/teacher.svg" alt="" className="mode-select-icon" />
                        <span>Teacher</span>
                      </div>
                    </Select.Item>
                    <Select.Item value="mentor">
                      <div className="mode-select-item">
                        <img src="/mentor.svg" alt="" className="mode-select-icon" />
                        <span>Mentor</span>
                      </div>
                    </Select.Item>
                  </Select.Content>
                </Select>
              </div>
            </div>
          </div>

          <button className="history-btn-exact" onClick={() => setShowHistory(!showHistory)}>
            History
          </button>
        </div> */}

        {/* History Popup */}
        {/* {showHistory && (
          <div className="popup-exact history-popup">
            <div className="popup-header">Recent Chats</div>
            <div className="history-list-exact">
              <div className="history-item-exact">
                <div>Newton's Laws</div>
                <div className="time-exact">2 hours ago</div>
              </div>
              <div className="history-item-exact">
                <div>Trigonometry</div>
                <div className="time-exact">Yesterday</div>
              </div>
              <div className="history-item-exact">
                <div>Trigonometry</div>
                <div className="time-exact">Yesterday</div>
              </div>

            </div>
          </div>
        )} */}
        </div>
      </div>

  );
}
