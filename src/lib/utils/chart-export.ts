/**
 * chart-export — recharts SVG чартыг PNG зураг болгон татах хэрэгсэл.
 *
 * Гадны сангүйгээр ажиллана: контейнер доторх <svg>-г сериалчилж canvas дээр
 * 2x нягтралтай зураад PNG болгон татна. Арын өнгийг контейнерын бодит
 * (computed) фонноос авдаг тул light/dark хоёуланд зөв гарна.
 */

/** Контейнерээс дээш явж эхний тунгалаг биш background өнгийг олно. */
function resolveBackground(el: HTMLElement): string {
    let node: HTMLElement | null = el;
    while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg)) {
            return bg;
        }
        node = node.parentElement;
    }
    return '#ffffff';
}

/**
 * Контейнерээс чартын SVG-г олно. Товчны icon зэрэг жижиг SVG-үүд байж
 * болох тул эхлээд recharts-ийн surface-ийг, олдохгүй бол хамгийн том
 * талбайтай SVG-г сонгоно.
 */
function findChartSvg(container: HTMLElement): SVGSVGElement | null {
    const surface = container.querySelector<SVGSVGElement>('svg.recharts-surface');
    if (surface) return surface;

    let best: SVGSVGElement | null = null;
    let bestArea = 0;
    for (const svg of container.querySelectorAll<SVGSVGElement>('svg')) {
        const rect = svg.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
            bestArea = area;
            best = svg;
        }
    }
    return best;
}

/**
 * Контейнер доторх чартын SVG-г PNG болгон татна.
 * SVG олдоогүй эсвэл зурахад алдаа гарвал reject хийнэ.
 */
export function downloadChartPng(container: HTMLElement, fileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const svg = findChartSvg(container);
        if (!svg) {
            reject(new Error('Чартын SVG олдсонгүй'));
            return;
        }

        const rect = svg.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));

        // xmlns байхгүй бол Image болгон ачаалагдахгүй тул хуулбар дээр баталгаажуулна.
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));

        const svgText = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            try {
                const scale = 2; // retina нягтрал
                const canvas = document.createElement('canvas');
                canvas.width = width * scale;
                canvas.height = height * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas context үүсгэж чадсангүй');

                ctx.fillStyle = resolveBackground(container);
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) {
                        reject(new Error('PNG үүсгэж чадсангүй'));
                        return;
                    }
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    resolve();
                }, 'image/png');
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('SVG зургийг ачаалж чадсангүй'));
        };
        img.src = url;
    });
}
