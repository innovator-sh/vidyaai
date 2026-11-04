import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { UploadSimple, FileText, FilePdf, Link as LinkIcon, Trash, ChatCircle, FunnelSimple, Warning } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { ToastRegion, useToasts } from '../../components/Toast';
import { api, ApiError, type DocumentRecord } from '../../lib/apiClient';
import { errorMessage } from '../../lib/errors';
import { DOCUMENT_TYPES, MAX_UPLOAD_BYTES } from '../../lib/documents';
import { urlErrorKey, validateDocumentUrl } from '../../lib/url';
import i18n, { localeFor } from '../../i18n';

const POLL_INTERVAL_MS = 3000;

/** Server message for known API failures, otherwise the localised fallback key. */
function failureText(err: unknown, fallbackKey: string, params?: Record<string, string>): string {
    if (err instanceof ApiError) return errorMessage(err, i18n.t, fallbackKey);
    return i18n.t(fallbackKey, params);
}

function docKind(name: string): 'pdf' | 'image' {
    return name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
}

function KnowledgeBase() {
    const router = useRouter();
    const { t, i18n: i18nInstance } = useTranslation();
    const locale = localeFor(i18nInstance.resolvedLanguage || i18nInstance.language);
    const { toasts, push, dismiss } = useToasts();
    const [urlInput, setUrlInput] = useState('');
    const [urlError, setUrlError] = useState<string | null>(null);
    const [addingUrl, setAddingUrl] = useState(false);

    const formatDate = (iso?: string): string => {
        if (!iso) return t('common.justNow');
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
            ? t('common.justNow')
            : d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    };
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [showDropzone, setShowDropzone] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async () => {
        try {
            const resp = await api.listDocuments();
            setDocuments(resp.items);
        } catch (err) {
            setError(failureText(err, 'kb.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Poll while anything is still being processed
    const hasProcessing = documents.some((d) => d.status === 'processing');
    useEffect(() => {
        if (!hasProcessing) return;
        const timer = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [hasProcessing, refresh]);

    const uploadFiles = async (files: File[]) => {
        setError(null);
        setUploading(true);
        try {
            for (const file of files) {
                if (!DOCUMENT_TYPES.includes(file.type)) {
                    setError(t('kb.notSupported', { name: file.name }));
                    continue;
                }
                if (file.size > MAX_UPLOAD_BYTES) {
                    setError(t('kb.tooLarge', { name: file.name }));
                    continue;
                }
                try {
                    const doc = await api.uploadDocument(file);
                    setDocuments((prev) => [{ ...doc, created_at: doc.created_at ?? new Date().toISOString() }, ...prev.filter((d) => d.id !== doc.id)]);
                } catch (err) {
                    setError(failureText(err, 'kb.uploadFailed', { name: file.name }));
                }
            }
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) uploadFiles(Array.from(e.target.files));
    };

    const handleDeleteDocument = async (id: string) => {
        const previous = documents;
        setDocuments((prev) => prev.filter((doc) => doc.id !== id));
        try {
            await api.deleteDocument(id);
        } catch (err) {
            setDocuments(previous);
            setError(failureText(err, 'kb.deleteFailed'));
        }
    };

    // Navigate to chat and pass the document as context
    const handleChatWithDocument = (doc: DocumentRecord) => {
        router.push({
            pathname: '/screens/chat',
            query: { docId: doc.id, docName: doc.name },
        });
    };

    const handleAddUrl = async () => {
        if (addingUrl) return;
        setUrlError(null);
        const check = validateDocumentUrl(urlInput);
        if (!check.ok) {
            const message = t(urlErrorKey(check.reason));
            setUrlError(message);
            if (check.reason !== 'empty') push('error', message);
            return;
        }
        setAddingUrl(true);
        try {
            const doc = await api.createDocumentFromUrl(check.url);
            setDocuments((prev) => [
                { ...doc, created_at: doc.created_at ?? new Date().toISOString() },
                ...prev.filter((d) => d.id !== doc.id),
            ]);
            setUrlInput('');
            push('success', t('kb.urlAdded'));
        } catch (err) {
            push('error', failureText(err, 'kb.urlFailed'));
        } finally {
            setAddingUrl(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setShowDropzone(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setShowDropzone(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setShowDropzone(false);
        if (e.dataTransfer.files) uploadFiles(Array.from(e.dataTransfer.files));
    };

    const getFileIcon = (name: string) =>
        docKind(name) === 'pdf' ? <FilePdf size={24} weight="fill" /> : <FileText size={24} weight="fill" />;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ready':
                return <span className="status-badge ready">● {t('kb.statusReady')}</span>;
            case 'processing':
                return <span className="status-badge processing">● {t('kb.statusProcessing')}</span>;
            case 'failed':
                return <span className="status-badge" style={{ color: '#c00' }}>● {t('kb.statusFailed')}</span>;
            default:
                return null;
        }
    };

    return (
        <div className="knowledge-base-page">
            <PillNav />

            <div className="kb-container">
                <div className="kb-header">
                    <div className="kb-header-content">
                        <h1 className="kb-title">{t('kb.library')}</h1>
                        <p className="kb-subtitle">
                            {t('kb.desc')}
                        </p>
                    </div>
                </div>

                {/* Upload Area */}
                <div
                    className={`kb-upload-area ${showDropzone ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="kb-upload-icon">
                        <UploadSimple size={48} weight="bold" />
                    </div>
                    <h3 className="kb-upload-title">{t('kb.uploadDesc')}</h3>
                    <p className="kb-upload-desc">
                        {t('kb.uploadSub')}
                    </p>
                    <div className="kb-upload-actions">
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                            multiple
                            onChange={handleFileUpload}
                        />
                        <button
                            className="kb-btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? t('kb.uploading') : t('kb.browse')}
                        </button>
                        <button className="kb-btn-secondary">{t('kb.tutorials')}</button>
                    </div>
                </div>

                {/* Add from URL */}
                <form
                    className="kb-url-section"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleAddUrl();
                    }}
                    noValidate
                >
                    <h4 className="kb-url-label">{t('kb.addUrl')}</h4>
                    <div className="kb-url-input-wrapper">
                        <LinkIcon size={20} weight="bold" />
                        <input
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            className="kb-url-input"
                            placeholder={t('kb.urlPlaceholder')}
                            aria-label={t('kb.addUrl')}
                            aria-invalid={urlError ? true : undefined}
                            value={urlInput}
                            onChange={(e) => {
                                setUrlInput(e.target.value);
                                if (urlError) setUrlError(null);
                            }}
                            disabled={addingUrl}
                        />
                        <button type="submit" className="kb-url-btn" disabled={addingUrl || !urlInput.trim()}>
                            {addingUrl ? t('kb.addingLink') : t('kb.addLink')}
                        </button>
                    </div>
                    {urlError && <p className="kb-url-error" role="alert">{urlError}</p>}
                </form>

                {error && (
                    <div className="history-error-banner" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', color: '#c00' }}>
                        <Warning size={18} weight="fill" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Recent Documents */}
                <div className="kb-documents-section">
                    <div className="kb-documents-header">
                        <div className="kb-documents-title-wrapper">
                            <h2 className="kb-documents-title">{t('kb.recent')}</h2>
                            <span className="kb-documents-count">{t('kb.filesCount', { count: documents.length })}</span>
                        </div>
                        <button className="kb-filter-btn">
                            <FunnelSimple size={20} weight="bold" />
                        </button>
                    </div>

                    <div className="kb-documents-list">
                        {loading && <p>{t('kb.loadingDocs')}</p>}
                        {!loading && documents.length === 0 && <p>{t('kb.emptyDocs')}</p>}
                        {documents.map((doc) => (
                            <div key={doc.id} className="kb-document-card">
                                <div className="kb-doc-icon">{getFileIcon(doc.name)}</div>
                                <div className="kb-doc-content">
                                    <div className="kb-doc-header">
                                        <h3 className="kb-doc-name">{doc.name}</h3>
                                        {getStatusBadge(doc.status)}
                                    </div>
                                    <div className="kb-doc-meta">
                                        <span>{t('kb.added', { date: formatDate(doc.created_at) })}</span>
                                    </div>
                                    {doc.status === 'processing' && (
                                        <div className="kb-progress-bar">
                                            <div className="kb-progress-fill"></div>
                                        </div>
                                    )}
                                </div>
                                <div className="kb-doc-actions">
                                    {doc.status === 'ready' ? (
                                        <button
                                            className="kb-doc-btn-primary"
                                            onClick={() => handleChatWithDocument(doc)}
                                        >
                                            <ChatCircle size={20} weight="bold" />
                                            {t('kb.chatDoc')}
                                        </button>
                                    ) : (
                                        <button className="kb-doc-btn-disabled" disabled>
                                            <span className="kb-indexing-text">{doc.status === 'failed' ? t('kb.failedShort') : t('kb.indexing')}</span>
                                        </button>
                                    )}
                                    <button
                                        className="kb-doc-btn-delete"
                                        onClick={() => handleDeleteDocument(doc.id)}
                                        title={t('kb.deleteDocument')}
                                        aria-label={t('kb.deleteDocument')}
                                    >
                                        <Trash size={24} weight="bold" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>

            <ToastRegion toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

export default function KnowledgeBasePage() {
    return (
        <ProtectedRoute>
            <KnowledgeBase />
        </ProtectedRoute>
    );
}
