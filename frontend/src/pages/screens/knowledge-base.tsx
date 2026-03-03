import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { UploadSimple, File, FileText, FilePdf, Link as LinkIcon, DotsThree, Trash, ChatCircle, FunnelSimple } from 'phosphor-react';
import PillNav from '../../components/PillNav';

interface Document {
    id: string;
    name: string;
    type: 'pdf' | 'doc' | 'url';
    size?: string;
    addedDate: string;
    status: 'ready' | 'processing' | 'indexed';
    url?: string;
}

export default function KnowledgeBase() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([
        {
            id: '1',
            name: 'Molecular Biology of the Cell',
            type: 'pdf',
            size: '12.4 MB',
            addedDate: 'Oct 24, 2023',
            status: 'ready',
        },
        {
            id: '2',
            name: 'Intro to Macroeconomics - Chapter 4',
            type: 'doc',
            size: '3.1 MB',
            addedDate: '2 mins ago',
            status: 'processing',
        },
        {
            id: '3',
            name: 'Artificial Intelligence: A Modern Approach',
            type: 'pdf',
            size: '45.2 MB',
            addedDate: 'Oct 20, 2023',
            status: 'ready',
        },
        {
            id: '4',
            name: 'https://openstax.org/details/psychology',
            type: 'url',
            addedDate: 'Oct 18, 2023',
            status: 'indexed',
            url: 'https://openstax.org/details/psychology',
        },
    ]);

    const [urlInput, setUrlInput] = useState('');
    const [showDropzone, setShowDropzone] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            Array.from(files).forEach((file) => {
                const newDoc: Document = {
                    id: Date.now().toString() + Math.random(),
                    name: file.name,
                    type: file.type.includes('pdf') ? 'pdf' : 'doc',
                    size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                    addedDate: 'Just now',
                    status: 'processing',
                };
                setDocuments((prev) => [newDoc, ...prev]);

                // Simulate processing
                setTimeout(() => {
                    setDocuments((prev) =>
                        prev.map((doc) =>
                            doc.id === newDoc.id ? { ...doc, status: 'ready' } : doc
                        )
                    );
                }, 3000);
            });
        }
    };

    const handleAddUrl = () => {
        if (urlInput.trim()) {
            const newDoc: Document = {
                id: Date.now().toString(),
                name: urlInput,
                type: 'url',
                addedDate: 'Just now',
                status: 'processing',
                url: urlInput,
            };
            setDocuments((prev) => [newDoc, ...prev]);
            setUrlInput('');

            // Simulate processing
            setTimeout(() => {
                setDocuments((prev) =>
                    prev.map((doc) =>
                        doc.id === newDoc.id ? { ...doc, status: 'indexed' } : doc
                    )
                );
            }, 2000);
        }
    };

    const handleDeleteDocument = (id: string) => {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    };

    // Navigate to chat and pass the document name as context
    const handleChatWithDocument = (doc: Document) => {
        router.push({
            pathname: '/screens/chat',
            query: { docId: doc.id, docName: doc.name, docType: doc.type },
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

        const files = e.dataTransfer.files;
        if (files) {
            Array.from(files).forEach((file) => {
                const newDoc: Document = {
                    id: Date.now().toString() + Math.random(),
                    name: file.name,
                    type: file.type.includes('pdf') ? 'pdf' : 'doc',
                    size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                    addedDate: 'Just now',
                    status: 'processing',
                };
                setDocuments((prev) => [newDoc, ...prev]);

                setTimeout(() => {
                    setDocuments((prev) =>
                        prev.map((doc) =>
                            doc.id === newDoc.id ? { ...doc, status: 'ready' } : doc
                        )
                    );
                }, 3000);
            });
        }
    };

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf':
                return <FilePdf size={24} weight="fill" />;
            case 'url':
                return <LinkIcon size={24} weight="bold" />;
            default:
                return <FileText size={24} weight="fill" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ready':
                return <span className="status-badge ready">● Ready</span>;
            case 'processing':
                return <span className="status-badge processing">● Processing...</span>;
            case 'indexed':
                return <span className="status-badge indexed">● Indexed</span>;
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
                        PDF, EPUB or Word documents (Max 50MB per file)
                    </p>
                    <div className="kb-upload-actions">
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".pdf,.epub,.doc,.docx"
                            multiple
                            onChange={handleFileUpload}
                        />
                        <button
                            className="kb-btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Browse Files
                        </button>
                        <button className="kb-btn-secondary">View Tutorials</button>
                    </div>
                </div>

                {/* Add from URL */}
                <div className="kb-url-section">
                    <h4 className="kb-url-label">ADD FROM URL</h4>
                    <div className="kb-url-input-wrapper">
                        <LinkIcon size={20} weight="bold" />
                        <input
                            type="text"
                            className="kb-url-input"
                            placeholder="Paste a link to a PDF or textbook website..."
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && urlInput.trim()) {
                                    handleAddUrl();
                                }
                            }}
                        />
                        <button className="kb-url-btn" onClick={handleAddUrl}>
                            Add Link
                        </button>
                    </div>
                </div>

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
                        {documents.map((doc) => (
                            <div key={doc.id} className="kb-document-card">
                                <div className="kb-doc-icon">{getFileIcon(doc.type)}</div>
                                <div className="kb-doc-content">
                                    <div className="kb-doc-header">
                                        <h3 className="kb-doc-name">{doc.name}</h3>
                                        {getStatusBadge(doc.status)}
                                    </div>
                                    <div className="kb-doc-meta">
                                        <span>Added {doc.addedDate}</span>
                                        {doc.size && (
                                            <>
                                                <span className="kb-doc-separator">•</span>
                                                <span>{doc.size}</span>
                                            </>
                                        )}
                                        {doc.type === 'url' && (
                                            <>
                                                <span className="kb-doc-separator">•</span>
                                                <span>URL Reference</span>
                                            </>
                                        )}
                                    </div>
                                    {doc.status === 'processing' && (
                                        <div className="kb-progress-bar">
                                            <div className="kb-progress-fill"></div>
                                        </div>
                                    )}
                                </div>
                                <div className="kb-doc-actions">
                                    {doc.status === 'ready' || doc.status === 'indexed' ? (
                                        <button
                                            className="kb-doc-btn-primary"
                                            onClick={() => handleChatWithDocument(doc)}
                                        >
                                            <ChatCircle size={20} weight="bold" />
                                            Chat with this book
                                        </button>
                                    ) : (
                                        <button className="kb-doc-btn-disabled" disabled>
                                            <span className="kb-indexing-text">Indexing</span>
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

                    <button className="kb-view-all-btn">
                        View all documents
                        <span className="kb-view-all-arrow">↓</span>
                    </button>
                </div>
            </div>
        </div>
    );
}