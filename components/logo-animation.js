'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hyperjump Transition Component
 * A high-end procedural warp-speed transition that uses canvas-based particles.
 * Supports smooth fade-out to reveal new content without "popping".
 * Refined to remove any artificial pausing at the peak for maximum fluidity.
 */
export default function LogoAnimation({ isDarkMode, onComplete, trigger }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [opacity, setOpacity] = useState(0);
    const [phase, setPhase] = useState('idle'); // idle -> warping -> peak -> fading
    const canvasRef = useRef(null);
    const requestRef = useRef(null);

    // Warp speed state
    const stars = useRef([]);
    const speed = useRef(0.01);
    const startTime = useRef(0);
    const duration = 2000;

    useEffect(() => {
        setMounted(true);
    }, []);

    const initStars = (width, height) => {
        const count = 400;
        const newStars = [];
        for (let i = 0; i < count; i++) {
            newStars.push({
                x: Math.random() * width - width / 2,
                y: Math.random() * height - height / 2,
                z: Math.random() * width,
                pz: 0
            });
        }
        stars.current = newStars;
    };

    const animate = (time) => {
        if (!startTime.current) startTime.current = time;
        const elapsed = time - startTime.current;
        const progress = Math.min(elapsed / duration, 1);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        const trailOpacity = 0.1 + progress * 0.2;
        ctx.fillStyle = isDarkMode ? `rgba(0,0,0,${trailOpacity})` : `rgba(255,255,255,${trailOpacity})`;
        ctx.fillRect(0, 0, width, height);

        speed.current = 0.01 + Math.pow(progress, 4) * 120;

        if (progress > 0.85 && phase === 'warping') {
            setPhase('peak');
        }

        ctx.save();
        ctx.translate(width / 2, height / 2);

        stars.current.forEach(star => {
            star.z -= speed.current;
            if (star.z <= 0) {
                star.z = width;
                star.x = Math.random() * width - width / 2;
                star.y = Math.random() * height - height / 2;
                star.pz = 0;
            }
            const sx = star.x / (star.z / width);
            const sy = star.y / (star.z / width);
            if (star.pz > 0) {
                const px = star.x / (star.pz / width);
                const py = star.y / (star.pz / width);
                ctx.beginPath();
                const r = isDarkMode ? 16 : 59;
                const g = isDarkMode ? 185 : 130;
                const b = isDarkMode ? 129 : 246;
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${progress})`;
                ctx.lineWidth = 1 + progress * 3;
                ctx.moveTo(px, py);
                ctx.lineTo(sx, sy);
                ctx.stroke();
            }
            star.pz = star.z;
        });

        ctx.restore();

        if (progress < 1) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            // Transition completed - trigger navigation
            if (onComplete) onComplete();

            // Go straight to fading out without any artificial hold/pause
            setPhase('fading');
            setTimeout(() => {
                setIsPlaying(false);
                setPhase('idle');
                setOpacity(0);
            }, 600); // Snappy fade out to reveal new content
        }
    };

    useEffect(() => {
        if (trigger && !isPlaying) {
            setIsPlaying(true);
            setOpacity(1);
            setPhase('warping');

            setTimeout(() => {
                const canvas = canvasRef.current;
                if (canvas) {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                    initStars(canvas.width, canvas.height);
                    startTime.current = 0;
                    requestRef.current = requestAnimationFrame(animate);
                }
            }, 50);
        }

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [trigger]);

    const overlay = (isPlaying && mounted) ? createPortal(
        <div
            className={`fixed inset-0 z-[20000000] transition-opacity duration-700 pointer-events-auto
                ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}
            `}
            style={{
                background: isDarkMode ? '#000' : '#fff'
            }}
        >
            <canvas
                ref={canvasRef}
                className={`w-full h-full block transition-opacity duration-300 ${phase === 'peak' || phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
            />

            <div className={`absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black pointer-events-none transition-opacity duration-1000
                ${isDarkMode ? 'opacity-80' : 'opacity-30'}
                ${phase === 'fading' ? 'opacity-0' : ''}
            `} />

            {/* Solid Mask phase to hide page swap - This is now fluid */}
            <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none
                ${phase === 'peak' || phase === 'fading' ? 'opacity-100' : 'opacity-0'}
            `} style={{
                    backgroundColor: isDarkMode ? 'black' : 'white'
                }} />
        </div>,
        document.body
    ) : null;

    return (
        <div className="relative h-10 w-auto">
            <img
                src="/mizan-logo.png"
                alt="Mizan Logo"
                className={`h-10 w-auto hover:brightness-125 transition-all duration-200 cursor-pointer ${isDarkMode ? '' : 'invert'}`}
            />
            {overlay}
        </div>
    );
}
