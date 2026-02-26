'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * YouTubePlayer component that hides all native YouTube controls
 * and provides a custom sound toggle.
 */
export default function YouTubePlayer({ videoId, className = '', title = 'Video' }) {
    const [isMuted, setIsMuted] = useState(true);
    const iframeRef = useRef(null);

    // Function to send commands to YouTube IFrame API via postMessage
    const postCommand = (command, args = []) => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: command, args: args }),
                '*'
            );
        }
    };

    const toggleMute = () => {
        if (isMuted) {
            postCommand('unMute');
        } else {
            postCommand('mute');
        }
        setIsMuted(!isMuted);
    };

    // Base URL with minimal branding and controls hidden
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;

    return (
        <div className={`relative w-full h-full group bg-black overflow-hidden ${className}`}>
            {/* The IFrame - Restored to 100% scale (no zoom) */}
            <iframe
                ref={iframeRef}
                src={embedUrl}
                className="w-full h-full border-0 pointer-events-none z-0"
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                loading="lazy"
            />

            {/* Transparent Overlay to block YouTube interactions */}
            <div className="absolute inset-0 bg-transparent z-10" />

            {/* Custom Control: Sound Toggle */}
            <div className="absolute bottom-3 right-3 z-20">
                <button
                    type="button"
                    onClick={toggleMute}
                    className="p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-white transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center"
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zm7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z" />
                            <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z" />
                            <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
