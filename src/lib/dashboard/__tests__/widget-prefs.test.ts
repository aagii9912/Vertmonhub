import { describe, it, expect } from 'vitest';
import {
    MANAGER_WIDGETS,
    mergeWidgetPrefs,
    toggleWidget,
    moveWidget,
    type WidgetPref,
    type WidgetDef,
} from '../widget-prefs';

const REGISTRY: WidgetDef[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
];

describe('mergeWidgetPrefs', () => {
    it('хоосон тохиргоонд registry-ийн default дараалал', () => {
        expect(mergeWidgetPrefs([], REGISTRY)).toEqual([
            { id: 'a', hidden: false },
            { id: 'b', hidden: false },
            { id: 'c', hidden: false },
        ]);
    });

    it('хадгалсан дараалал хэвээр, шинэ виджет төгсгөлд нэмэгдэнэ', () => {
        const saved: WidgetPref[] = [
            { id: 'c', hidden: true },
            { id: 'a', hidden: false },
        ];
        expect(mergeWidgetPrefs(saved, REGISTRY)).toEqual([
            { id: 'c', hidden: true },
            { id: 'a', hidden: false },
            { id: 'b', hidden: false },
        ]);
    });

    it('registry-ээс хасагдсан id унана, давхардал цэвэрлэгдэнэ', () => {
        const saved: WidgetPref[] = [
            { id: 'removed', hidden: false },
            { id: 'b', hidden: true },
            { id: 'b', hidden: false },
        ];
        expect(mergeWidgetPrefs(saved, REGISTRY)).toEqual([
            { id: 'b', hidden: true },
            { id: 'a', hidden: false },
            { id: 'c', hidden: false },
        ]);
    });

    it('буруу хэлбэртэй өгөгдлийг тэсвэрлэнэ', () => {
        const saved = [null, { hidden: true }, { id: 42 }, { id: 'a', hidden: 'yes' }] as unknown as WidgetPref[];
        expect(mergeWidgetPrefs(saved, REGISTRY)).toEqual([
            { id: 'a', hidden: true },
            { id: 'b', hidden: false },
            { id: 'c', hidden: false },
        ]);
    });

    it('MANAGER_WIDGETS бүртгэл давхардалгүй id-тай', () => {
        const ids = MANAGER_WIDGETS.map((w) => w.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('toggleWidget', () => {
    it('харагдацыг эргүүлнэ, бусад нь хэвээр', () => {
        const prefs = mergeWidgetPrefs([], REGISTRY);
        const out = toggleWidget(prefs, 'b');
        expect(out.find((p) => p.id === 'b')?.hidden).toBe(true);
        expect(out.find((p) => p.id === 'a')?.hidden).toBe(false);
        // immutable
        expect(prefs.find((p) => p.id === 'b')?.hidden).toBe(false);
    });
});

describe('moveWidget', () => {
    const prefs: WidgetPref[] = [
        { id: 'a', hidden: false },
        { id: 'b', hidden: false },
        { id: 'c', hidden: false },
    ];

    it('дээш зөөнө', () => {
        expect(moveWidget(prefs, 'b', -1).map((p) => p.id)).toEqual(['b', 'a', 'c']);
    });

    it('доош зөөнө', () => {
        expect(moveWidget(prefs, 'b', 1).map((p) => p.id)).toEqual(['a', 'c', 'b']);
    });

    it('хилээс хэтэрвэл өөрчлөхгүй', () => {
        expect(moveWidget(prefs, 'a', -1).map((p) => p.id)).toEqual(['a', 'b', 'c']);
        expect(moveWidget(prefs, 'c', 1).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });

    it('олдохгүй id-д өөрчлөхгүй', () => {
        expect(moveWidget(prefs, 'x', 1)).toBe(prefs);
    });
});
