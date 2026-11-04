import { useTranslation } from 'react-i18next';
import { Paperclip, FilePdf, X, WarningCircle, CheckCircle, CircleNotch } from 'phosphor-react';

export type AttachmentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface Attachment {
  file: File;
  kind: 'image' | 'pdf';
  status: AttachmentStatus;
  /** Data URL preview (images only). */
  previewUrl: string | null;
  /** Server document id (PDFs only, once uploaded). */
  documentId: string | null;
}

const STATUS_KEY: Record<AttachmentStatus, string> = {
  uploading: 'chat.attachmentUploading',
  processing: 'chat.attachmentProcessing',
  ready: 'chat.attachmentReady',
  failed: 'chat.attachmentFailedShort',
};

export default function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { t } = useTranslation();
  const { file, kind, status, previewUrl } = attachment;
  const busy = status === 'uploading' || status === 'processing';

  return (
    <div className={`file-indicator attachment-chip ${previewUrl ? 'has-image' : ''} ${status}`} data-status={status}>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={t('chat.preview')} className="file-indicator-preview-img" />
      ) : kind === 'pdf' ? (
        <FilePdf size={14} weight="bold" />
      ) : (
        <Paperclip size={14} weight="bold" />
      )}
      <span className="file-name">{file.name}</span>
      {kind === 'pdf' && (
        <span className="attachment-status" role="status">
          {busy && <CircleNotch size={12} weight="bold" className="attachment-spinner" />}
          {status === 'ready' && <CheckCircle size={12} weight="fill" />}
          {status === 'failed' && <WarningCircle size={12} weight="fill" />}
          {t(STATUS_KEY[status])}
        </span>
      )}
      <button type="button" className="file-remove-btn" onClick={onRemove} title={t('chat.removeFile')} aria-label={t('chat.removeFile')}>
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
