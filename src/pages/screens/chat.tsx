import { useState, useRef } from 'react';
import { Plus, Database, Moon, ClockCounterClockwise, ChartPie, Waves, Gift, Paperclip, ArrowRight, FileText, Lightbulb, PencilSimple, Exam, CaretRight, CaretLeft, DotsThree, ChatCircleDots, Star } from 'phosphor-react';
import StaggeredMenu from '../../components/StaggeredMenu';
import { Loader } from '../../components/retroui/Loader';
import { Select } from '../../components/retroui/Select';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export default function Chat() {

  const menuItems = [
    { label: 'Home', ariaLabel: 'Go to home page', link: '/' },
    { label: 'Chat', ariaLabel: 'Chat with AI', link: '/screens/chat' },
    { label: 'Stats', ariaLabel: 'Statistics for Progress', link: '/screens/stats' },
    { label: 'Account', ariaLabel: 'Account Settings', link: '/account' }
  ];

  const socialItems = [
    { label: 'Twitter', link: 'https://twitter.com' },
    { label: 'GitHub', link: 'https://github.com' },
    { label: 'LinkedIn', link: 'https://linkedin.com' }
  ];



  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedMode, setSelectedMode] = useState('study-buddy');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim()) {
      setMessages([...messages, { role: 'user', content: input }]);
      setInput('');
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          role: 'ai',
          content: 'I understand. Let me help you with that...'
        }]);
      }, 1500);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className={`chat-exact ${nightMode ? 'night-mode' : ''}`}>
      <StaggeredMenu
        position="right"
        items={menuItems}
        socialItems={socialItems}
        displaySocials
        displayItemNumbering={true}
        menuButtonColor="#2a2a2a"
        openMenuButtonColor="#2a2a2a"
        changeMenuColorOnOpen={false}
        colors={['#FF3D9A', '#0066FF']}
        accentColor="#0066FF"
        onMenuOpen={() => console.log('Menu opened')}
        onMenuClose={() => console.log('Menu closed')}
        isFixed={true}
      />

      {/* Left Sidebar */}
      <div className={`sidebar-exact ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button 
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
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
          
          <button 
            className="sidebar-btn" 
            onClick={() => setShowHistory(!showHistory)}
            title="History"
          >
            <ClockCounterClockwise size={24} />
            {!sidebarCollapsed && <span className="sidebar-label">History</span>}
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="main-exact">

        {/* Center Content */}
        {messages.length === 0 ? (
          <div className="center-exact">
            <div className="welcome-icon">
              <img src="/vidyaa-logo.svg" alt="Vidya AI" className="logo-icon" />
            </div>
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
                        <DotsThree size={20} weight="bold" />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="study-buddy">
                          <div className="mode-option">
                            <img src="/study-buddy.svg" alt="" className="mode-option-icon" />
                            <span>Study Buddy</span>
                          </div>
                        </Select.Item>
                        <Select.Item value="teacher">
                          <div className="mode-option">
                            <img src="/teacher.svg" alt="" className="mode-option-icon" />
                            <span>Teacher</span>
                          </div>
                        </Select.Item>
                        <Select.Item value="mentor">
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
                <div className="msg-text-exact">{msg.content}</div>
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
                      <DotsThree size={20} weight="bold" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="study-buddy">
                        <div className="mode-option">
                          <img src="/study-buddy.svg" alt="" className="mode-option-icon" />
                          <span>Study Buddy</span>
                        </div>
                      </Select.Item>
                      <Select.Item value="teacher">
                        <div className="mode-option">
                          <img src="/teacher.svg" alt="" className="mode-option-icon" />
                          <span>Teacher</span>
                        </div>
                      </Select.Item>
                      <Select.Item value="mentor">
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
        {showHistory && (
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
        )}
        </div>
      </div>

  );
}
