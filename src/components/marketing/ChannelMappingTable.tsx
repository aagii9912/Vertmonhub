'use client';

import { channelFields, mappedField, type ChannelField, type ChannelMapping, type ChannelSource } from '@/lib/marketing/channel-reports';
import { marketingInputClass } from './PerformanceEditor';

/** CallPro-гийн талбаруудыг файлын хэлбэрээр, бусдыг үзүүлэлт / ангиллаар бүлэглэнэ. */
function fieldGroups(source: ChannelSource): Array<{ label: string; fields: ChannelField[] }> {
    const fields = channelFields(source);
    const groups = new Map<string, ChannelField[]>();
    for (const field of fields) {
        let label: string;
        if (source !== 'callpro') label = field.role === 'metric' ? 'Үзүүлэлт' : 'Ангилал, огноо';
        else if (!field.shapes || field.shapes.length === 3 || field.key === 'group') label = 'Нийтлэг';
        else if (field.shapes.length === 1 && field.shapes[0] === 'calls') label = 'Дуудлагын жагсаалт';
        else if (field.shapes.length === 1 && field.shapes[0] === 'hourly') label = 'Цагийн тайлан';
        else label = 'Бүлгийн / цагийн тайлан';
        groups.set(label, [...(groups.get(label) ?? []), field]);
    }
    return [...groups].map(([label, list]) => ({ label, fields: list }));
}

/**
 * Файлын багана бүрийг үзүүлэлттэй холбох хүснэгт. Санал болгосон / сануулсан холболтоор
 * бөглөгдсөн байх ба хэрэглэгч засна. Нэг үзүүлэлтэд хоёр багана сонговол тэмдэглэнэ.
 */
export function ChannelMappingTable({ source, headers, mapping, sample, disabled, onChange }: {
    source: ChannelSource;
    headers: string[];
    mapping: ChannelMapping;
    sample: Record<string, string[]>;
    disabled?: boolean;
    onChange: (mapping: ChannelMapping) => void;
}) {
    const groups = fieldGroups(source);
    const used = new Map<string, number>();
    for (const key of Object.values(mapping)) if (key) used.set(key, (used.get(key) ?? 0) + 1);
    return <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Баганын холболт">
        <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground">
                <tr><th scope="col" className="px-3 py-2 font-medium">Файлын багана</th><th scope="col" className="px-3 py-2 font-medium">Жишээ утга</th><th scope="col" className="px-3 py-2 font-medium">Үзүүлэлт</th></tr>
            </thead>
            <tbody>{headers.map(header => {
                const key = mappedField(mapping, header);
                const duplicate = !!key && (used.get(key) ?? 0) > 1;
                return <tr key={header} className="border-t border-border align-top">
                    <th scope="row" className="max-w-56 break-words px-3 py-2 font-medium">{header}</th>
                    <td className="max-w-64 break-words px-3 py-2 text-xs text-muted-foreground">{sample[header]?.filter(Boolean).join(' · ') || '—'}</td>
                    <td className="min-w-56 px-3 py-2">
                        <select aria-label={`«${header}» баганын үзүүлэлт`} aria-invalid={duplicate || undefined} disabled={disabled}
                            className={`${marketingInputClass} ${duplicate ? 'border-status-danger' : ''}`} value={key}
                            onChange={event => onChange({ ...mapping, [header]: event.target.value })}>
                            <option value="">— Ашиглахгүй —</option>
                            {groups.map(group => <optgroup key={group.label} label={group.label}>
                                {group.fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                            </optgroup>)}
                        </select>
                        {duplicate && <p className="mt-1 text-xs text-status-danger">Энэ үзүүлэлтэд өөр багана ч сонгосон байна.</p>}
                    </td>
                </tr>;
            })}</tbody>
        </table>
    </div>;
}
