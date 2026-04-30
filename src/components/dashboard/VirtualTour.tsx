'use client';

import { useState } from 'react';
import { Maximize2, Minimize2, ExternalLink, X } from 'lucide-react';

interface VirtualTourProps {
    /** URL to 360° tour (Matterport, Kuula, or similar) */
    tourUrl: string;
    /** Property name for display */
    propertyName?: string;
    /** Poster/thumbnail image */
    posterImage?: string;
    /** Aspect ratio */
    aspectRatio?: '16:9' | '4:3' | '1:1';
}

export function VirtualTour({ tourUrl, propertyName, posterImage, aspectRatio = '16:9' }: VirtualTourProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [showTour, setShowTour] = useState(false);

    const aspectClass = {
        '16:9': 'aspect-video',
        '4:3': 'aspect-[4/3]',
        '1:1': 'aspect-square',
    }[aspectRatio];

    if (isFullscreen) {
        return (
            <div className="fixed inset-0 z-50 bg-black">
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <a href={tourUrl} target="_blank" rel="noopener noreferrer"
                        className="p-2 bg-surface/20 backdrop-blur rounded-lg text-white hover:bg-surface/30 transition-colors">
                        <ExternalLink className="w-5 h-5" />
                    </a>
                    <button onClick={() => setIsFullscreen(false)}
                        className="p-2 bg-surface/20 backdrop-blur rounded-lg text-white hover:bg-surface/30 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {propertyName && (
                    <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/50 backdrop-blur rounded-lg text-white text-sm font-medium">
                        {propertyName}
                    </div>
                )}
                <iframe
                    src={tourUrl}
                    className="w-full h-full border-0"
                    allow="accelerometer; gyroscope; fullscreen; xr-spatial-tracking"
                    allowFullScreen
                />
            </div>
        );
    }

    return (
        <div className="rounded-xl overflow-hidden border border-border bg-foreground">
            {!showTour ? (
                <div
                    className={`relative ${aspectClass} cursor-pointer group`}
                    onClick={() => setShowTour(true)}
                >
                    {posterImage ? (
                        <img src={posterImage} alt={propertyName || 'Virtual Tour'} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-900 to-indigo-900 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-5xl mb-2">🏠</div>
                                <p className="text-white/60 text-sm">360° Virtual Tour</p>
                            </div>
                        </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-surface/90 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                            <div className="text-2xl ml-1">▶</div>
                        </div>
                    </div>
                    {propertyName && (
                        <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-white text-xs font-medium">
                            🔄 {propertyName}
                        </div>
                    )}
                </div>
            ) : (
                <div className={`relative ${aspectClass}`}>
                    {!isLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground">
                            <div className="text-center">
                                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2" />
                                <p className="text-white/60 text-xs">Тур ачааллаж байна...</p>
                            </div>
                        </div>
                    )}
                    <iframe
                        src={tourUrl}
                        className="w-full h-full border-0"
                        allow="accelerometer; gyroscope; fullscreen; xr-spatial-tracking"
                        allowFullScreen
                        onLoad={() => setIsLoaded(true)}
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                        <button onClick={() => setIsFullscreen(true)}
                            className="p-1.5 bg-black/50 backdrop-blur rounded text-white hover:bg-black/70 transition-colors">
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
