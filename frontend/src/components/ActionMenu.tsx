import React from 'react';
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
  if (!isOpen) return null;

  return (
    <>
      <div className="action-menu-overlay" onClick={onClose} />
      <div className="action-menu">
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

