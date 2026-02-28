import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import styles from './MarkdownMessage.module.css';

interface MarkdownMessageProps {
    content: string;
    isUser?: boolean;
}

/**
 * Renders AI/user messages with full markdown formatting + LaTeX math:
 * **bold**, *italic*, lists, code blocks, headers, $$...$$ and $...$ equations.
 */
export default function MarkdownMessage({ content, isUser }: MarkdownMessageProps) {
    if (isUser) {
        // User messages are plain text — no markdown needed
        return <span>{content}</span>;
    }

    return (
        <div className={styles.markdown}>
            <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    // Headings
                    h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
                    h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
                    h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
                    // Paragraphs — add spacing
                    p: ({ children }) => <p className={styles.p}>{children}</p>,
                    // Lists
                    ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
                    ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
                    li: ({ children }) => <li className={styles.li}>{children}</li>,
                    // Bold & italic
                    strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
                    em: ({ children }) => <em className={styles.em}>{children}</em>,
                    // Inline code
                    code: ({ children }) => <code className={styles.code}>{children}</code>,
                    // Code blocks
                    pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
                    // Horizontal rule
                    hr: () => <hr className={styles.hr} />,
                    // Block quote
                    blockquote: ({ children }) => (
                        <blockquote className={styles.blockquote}>{children}</blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
