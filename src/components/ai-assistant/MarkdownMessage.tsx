'use client';

/**
 * AI хариултыг markdown-аар гоё харуулна: хүснэгт (GFM), жагсаалт, тод, код,
 * холбоос, гарчиг — design token-д нийцсэн typography-тэй.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ content }: { content: string }) {
    return (
        <div className="text-[15px] leading-relaxed text-foreground space-y-2.5 break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="text-brand-strong font-medium underline underline-offset-2 hover:opacity-80">{children}</a>
                    ),
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground/60">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 marker:text-muted-foreground/60">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-[15px] font-bold text-foreground mt-3 mb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-[15px] font-semibold text-foreground mt-2 mb-1">{children}</h3>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-brand/40 pl-3 text-muted-foreground italic">{children}</blockquote>
                    ),
                    hr: () => <hr className="border-border/60 my-3" />,
                    code: ({ children }) => (
                        <code className="px-1.5 py-0.5 rounded-md bg-surface-2 text-[13px] font-mono text-brand-strong">{children}</code>
                    ),
                    pre: ({ children }) => (
                        <pre className="bg-surface-2/70 border border-border/60 rounded-xl p-3 overflow-x-auto text-[13px] font-mono [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-foreground">{children}</pre>
                    ),
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-2 rounded-xl border border-border/60">
                            <table className="w-full text-sm border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
                    th: ({ children }) => <th className="text-left font-semibold text-foreground px-3 py-2 border-b border-border/60 whitespace-nowrap">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 border-b border-border/40 align-top tabular-nums">{children}</td>,
                    tr: ({ children }) => <tr className="even:bg-surface-2/30">{children}</tr>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
