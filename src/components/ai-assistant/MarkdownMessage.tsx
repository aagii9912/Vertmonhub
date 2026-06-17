'use client';

/**
 * AI хариултыг гоё харуулах — гадны сангаас хамааралгүй (build-safe) markdown renderer.
 * Дэмждэг: GFM хүснэгт, гарчиг (#, ##, ###), жагсаалт (-, *, 1.), код блок (```),
 * ишлэл (>), зураас (---), мөр доторх **тод**, *налуу*, `код`, [холбоос](url).
 */

import React from 'react';

// ---- Мөр доторх формат ----
function renderInline(text: string, kp: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*|__([^_]+)__)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = regex.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        if (m[2] !== undefined) nodes.push(<strong key={`${kp}-b${i}`} className="font-semibold text-foreground">{m[2]}</strong>);
        else if (m[3] !== undefined) nodes.push(<code key={`${kp}-c${i}`} className="px-1.5 py-0.5 rounded-md bg-surface-2 text-[13px] font-mono text-brand-strong">{m[3]}</code>);
        else if (m[4] !== undefined) nodes.push(<a key={`${kp}-a${i}`} href={m[5]} target="_blank" rel="noreferrer" className="text-brand-strong underline underline-offset-2 hover:opacity-80">{m[4]}</a>);
        else if (m[6] !== undefined) nodes.push(<em key={`${kp}-i${i}`} className="italic">{m[6]}</em>);
        else if (m[7] !== undefined) nodes.push(<strong key={`${kp}-u${i}`} className="font-semibold text-foreground">{m[7]}</strong>);
        last = m.index + m[0].length;
        i++;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
}

const isTableSep = (line?: string) => !!line && /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-') && line.includes('|');
const isHr = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);

export function MarkdownMessage({ content }: { content: string }) {
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // Код блок ```
        if (line.trim().startsWith('```')) {
            const code: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; }
            i++; // хаах ```-ийг алгасна
            blocks.push(
                <pre key={key++} className="bg-surface-2/70 border border-border/60 rounded-xl p-3 overflow-x-auto text-[13px] font-mono text-foreground">
                    <code>{code.join('\n')}</code>
                </pre>
            );
            continue;
        }

        // Хүснэгт
        if (line.includes('|') && isTableSep(lines[i + 1])) {
            const header = splitRow(line);
            i += 2; // header + separator
            const rows: string[][] = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
            blocks.push(
                <div key={key++} className="overflow-x-auto my-2 rounded-xl border border-border/60">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-surface-2">
                            <tr>{header.map((h, hi) => <th key={hi} className="text-left font-semibold text-foreground px-3 py-2 border-b border-border/60 whitespace-nowrap">{renderInline(h, `th${key}-${hi}`)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {rows.map((r, ri) => (
                                <tr key={ri} className="even:bg-surface-2/30">
                                    {r.map((c, ci) => <td key={ci} className="px-3 py-2 border-b border-border/40 align-top tabular-nums">{renderInline(c, `td${key}-${ri}-${ci}`)}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // Гарчиг
        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            const lvl = h[1].length;
            const cls = lvl <= 1 ? 'text-base font-bold mt-3 mb-1' : lvl === 2 ? 'text-[15px] font-bold mt-3 mb-1' : 'text-[15px] font-semibold mt-2 mb-1';
            blocks.push(<div key={key++} className={`${cls} text-foreground`}>{renderInline(h[2], `h${key}`)}</div>);
            i++;
            continue;
        }

        // Зураас
        if (isHr(line)) { blocks.push(<hr key={key++} className="border-border/60 my-3" />); i++; continue; }

        // Ишлэл
        if (/^\s*>\s?/.test(line)) {
            const quote: string[] = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
            blocks.push(<blockquote key={key++} className="border-l-2 border-brand/40 pl-3 text-muted-foreground italic">{renderInline(quote.join(' '), `q${key}`)}</blockquote>);
            continue;
        }

        // Жагсаалт
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
            const ordered = /^\s*\d+\.\s+/.test(line);
            const items: string[] = [];
            while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
                i++;
            }
            const itemNodes = items.map((it, ii) => <li key={ii} className="leading-relaxed">{renderInline(it, `li${key}-${ii}`)}</li>);
            blocks.push(ordered
                ? <ol key={key++} className="list-decimal pl-5 space-y-1 marker:text-muted-foreground/60">{itemNodes}</ol>
                : <ul key={key++} className="list-disc pl-5 space-y-1 marker:text-muted-foreground/60">{itemNodes}</ul>);
            continue;
        }

        // Догол мөр (дараагийн хоосон/тусгай мөр хүртэл)
        const para: string[] = [];
        while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```')
            && !(lines[i].includes('|') && isTableSep(lines[i + 1]))
            && !/^(#{1,6})\s+/.test(lines[i]) && !isHr(lines[i])
            && !/^\s*>\s?/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
            para.push(lines[i]);
            i++;
        }
        if (para.length) {
            blocks.push(<p key={key++} className="leading-relaxed">{renderInline(para.join(' '), `p${key}`)}</p>);
        }
    }

    return <div className="text-[15px] leading-relaxed text-foreground space-y-2.5 break-words">{blocks}</div>;
}
