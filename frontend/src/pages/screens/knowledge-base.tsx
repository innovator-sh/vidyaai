import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { UploadSimple, FileText, FilePdf, Link as LinkIcon, Trash, ChatCircle, FunnelSimple, Warning } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { api, ApiError, type DocumentRecord } from '../../lib/apiClient';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const POLL_INTERVAL_MS = 3000;

function messageOf(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
        return err.status === 429 && err.retryAfter ? `${err.message} (retry in ${err.retryAfter}s)` : err.message;
    }
    return fallback;
}

function formatDate(iso?: string): string {
    if (!iso) return 'Just now';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Just now' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function docKind(name: string): 'pdf' | 'image' {
    return name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
}

function KnowledgeBase() {
    const router = useRouter();
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
            setError(messageOf(err, 'Could not load your documents.'));
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
                if (!ALLOWED_TYPES.includes(file.type)) {
                    setError(`"${file.name}" is not supported. Upload a PDF, PNG or JPG.`);
                    continue;
                }
                if (file.size > MAX_UPLOAD_BYTES) {
                    setError(`"${file.name}" is larger than 10 MB.`);
                    continue;
                }
                try {
                    const doc = await api.uploadDocument(file);
                    setDocuments((prev) => [{ ...doc, created_at: doc.created_at ?? new Date().toISOString() }, ...prev.filter((d) => d.id !== doc.id)]);
                } catch (err) {
                    setError(messageOf(err, `Could not upload "${file.name}".`));
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
            setError(messageOf(err, 'Could not delete the document.'));
        }
    };

    // Navigate to chat and pass the document as context
    const handleChatWithDocument = (doc: DocumentRecord) => {
        router.push({
            pathname: '/screens/chat',
            query: { docId: doc.id, docName: doc.name },
        });
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
                return <span className="status-badge ready">● Ready</span>;
            case 'processing':
                return <span className="status-badge processing">● Processing...</span>;
            case 'failed':
                return <span className="status-badge" style={{ color: '#c00' }}>● Failed</span>;
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
                        <h1 className="kb-title">My Knowledge Base</h1>
                        <p className="kb-subtitle">
                            Upload your textbooks and lecture notes to power your personal AI tutor.
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
                    <h3 className="kb-upload-title">Drag & Drop textbooks here</h3>
                    <p className="kb-upload-desc">
                        PDF, PNG or JPG (Max 10MB per file)
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
                            {uploading ? 'Uploading...' : 'Browse Files'}
                        </button>
                        <button className="kb-btn-secondary">View Tutorials</button>
                    </div>
                </div>

                {/* Add from URL (not available yet) */}
                <div className="kb-url-section">
                    <h4 className="kb-url-label">ADD FROM URL</h4>
                    <div className="kb-url-input-wrapper">
                        <LinkIcon size={20} weight="bold" />
                        <input
                            type="text"
                            className="kb-url-input"
                            placeholder="Link import is coming soon"
                            disabled
                        />
                        <button className="kb-url-btn" disabled>
                            Add Link
                        </button>
                    </div>
                </div>

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
                            <h2 className="kb-documents-title">Recent Documents</h2>
                            <span className="kb-documents-count">{documents.length} files</span>
                        </div>
                        <button className="kb-filter-btn">
                            <FunnelSimple size={20} weight="bold" />
                        </button>
                    </div>

                    <div className="kb-documents-list">
                        {loading && <p>Loading your documents...</p>}
                        {!loading && documents.length === 0 && <p>No documents yet. Upload a textbook or notes to get started.</p>}
                        {documents.map((doc) => (
                            <div key={doc.id} className="kb-document-card">
                                <div className="kb-doc-icon">{getFileIcon(doc.name)}</div>
                                <div className="kb-doc-content">
                                    <div className="kb-doc-header">
                                        <h3 className="kb-doc-name">{doc.name}</h3>
                                        {getStatusBadge(doc.status)}
                                    </div>
                                    <div className="kb-doc-meta">
                                        <span>Added {formatDate(doc.created_at)}</span>
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
                                            Chat with this book
                                        </button>
                                    ) : (
                                        <button className="kb-doc-btn-disabled" disabled>
                                            <span className="kb-indexing-text">{doc.status === 'failed' ? 'Failed' : 'Indexing'}</span>
                                        </button>
                                    )}
                                    <button
                                        className="kb-doc-btn-delete"
                                        onClick={() => handleDeleteDocument(doc.id)}
                                        title="Delete document"
                                    >
                                        <Trash size={24} weight="bold" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
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
