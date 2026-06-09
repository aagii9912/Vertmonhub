import Script from 'next/script';

/**
 * Meta Pixel + GA4 tracking script-ууд. Зөвхөн харгалзах env тохируулсан үед рендэр хийнэ.
 * Энэ нь PageView-г автоматаар галлана; Lead зэрэг event-ийг форм дээр нэмж галлаж болно.
 */
export function AnalyticsScripts() {
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;

    return (
        <>
            {pixelId && (
                <>
                    <Script id="meta-pixel" strategy="afterInteractive">
                        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
                        `}
                    </Script>
                    <noscript>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            height="1"
                            width="1"
                            style={{ display: 'none' }}
                            alt=""
                            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
                        />
                    </noscript>
                </>
            )}

            {ga4Id && (
                <>
                    <Script
                        src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
                        strategy="afterInteractive"
                    />
                    <Script id="ga4" strategy="afterInteractive">
                        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4Id}');
                        `}
                    </Script>
                </>
            )}
        </>
    );
}
