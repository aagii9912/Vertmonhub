/**
 * element-image — DOM элементийг PNG/JPEG зураг болгон татна (тайланг мессенжерт илгээхэд).
 *
 * `modern-screenshot` нь SVG foreignObject-оор хөтчийн өөрийн рендерийг ашигладаг тул Tailwind-ийн
 * өнгө, вэб фонт (Inter, кирилл) зурагт дэлгэцтэй адил гарна. Сан зөвхөн татах үед ачаалагдана.
 */

export type ImageFormat = 'png' | 'jpeg';

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };
const EXTENSION: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg' };

/** Хэвтээ гүйлгэгчтэй хэсэг (өргөн хүснэгт) зурагт тасрахгүйн тулд элементийг агуулгад нь хүртэл өргөсгөнө. */
function widenToContent(node: HTMLElement) {
    let overflow = 0;
    for (const element of node.querySelectorAll<HTMLElement>('*')) {
        const extra = element.scrollWidth - element.clientWidth;
        if (extra > 0 && /auto|scroll/.test(getComputedStyle(element).overflowX)) overflow = Math.max(overflow, extra);
    }
    if (overflow > 0) node.style.width = `${parseFloat(getComputedStyle(node).width) + overflow}px`;
}

/**
 * Элементийг 2x нягтралтай зураг болгон `<fileName>.png|jpg` нэрээр татна. Фон нь элементийн өөрийн
 * өнгө (JPEG тунгалаг хэсэггүй), тиймээс элемент өөрөө фонтой байх ёстой. Алдаа гарвал reject хийнэ.
 */
export async function downloadElementImage(node: HTMLElement, fileName: string, format: ImageFormat): Promise<void> {
    const { domToBlob } = await import('modern-screenshot');
    await document.fonts.ready;
    const width = node.style.width;
    widenToContent(node);
    try {
        const blob = await domToBlob(node, {
            type: MIME[format],
            quality: 0.92,
            scale: 2,
            backgroundColor: getComputedStyle(node).backgroundColor,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.${EXTENSION[format]}`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
        node.style.width = width;
    }
}
