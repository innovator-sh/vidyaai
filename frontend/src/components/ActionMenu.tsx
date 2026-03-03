import React, { useRef, useState, useLayoutEffect } from 'react';
import { FlowArrow, FileDoc, Exam, SpeakerHigh } from 'phosphor-react';

interface ActionMenuProps {
  isOpen: boolean;
  messageIndex: number;
  messageContent: string;
  isSpeaking: boolean;
  isGeneratingReport: boolean;
  onClose: () => void;
  onGenerateFlowchart: (content: string, index: number) => void;
  onGenerateReport: (content: string) => void;
  onGenerateQuiz: (content: string) => void;
  onToggleSpeech: (content: string, index: number) => void;
}

export default function ActionMenu({
  isOpen,
  messageIndex,
  messageContent,
  isSpeaking,
  isGeneratingReport,
  onClose,
  onGenerateFlowchart,
  onGenerateReport,
  onGenerateQuiz,
  onToggleSpeech,
}: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openUpwards, setOpenUpwards] = useState(false);

  useLayoutEffect(() => {
    if (isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      if (rect.bottom > windowHeight) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
    } else if (!isOpen) {
      setOpenUpwards(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="action-menu-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        className={`action-menu ${openUpwards ? 'open-upwards' : ''}`}
      >
        <button
          className="action-menu-item"
          onClick={() => {
            onGenerateFlowchart(messageContent, messageIndex);
            onClose();
          }}
        >
          <FlowArrow size={18} weight="bold" />
          <span>Generate Flowchart</span>
        </button>
        <button
          className="action-menu-item"
          onClick={() => {
            onGenerateReport(messageContent);
            onClose();
          }}
          disabled={isGeneratingReport}
        >
          <FileDoc size={18} weight="bold" />
          <span>{isGeneratingReport ? 'Generating…' : 'Generate Report'}</span>
        </button>
        <button
          className="action-menu-item"
          onClick={() => {
            onGenerateQuiz(messageContent);
            onClose();
          }}
        >
          <Exam size={18} weight="bold" />
          <span>Generate Quiz</span>
        </button>
        <button
          className="action-menu-item"
          onClick={() => {
            onToggleSpeech(messageContent, messageIndex);
            onClose();
          }}
        >
          <SpeakerHigh size={18} weight={isSpeaking ? 'fill' : 'bold'} />
          <span>{isSpeaking ? 'Stop Audio' : 'Read Aloud'}</span>
        </button>
      </div>
    </>
  );
}

