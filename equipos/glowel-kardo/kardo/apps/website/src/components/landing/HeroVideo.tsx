"use client";
import { useEffect, useRef, useState } from "react";

/** Where the 1080p clip would be stretched: any retina screen (phones crop
    it close on the stand) and wide screens. */
const wideHero = "(min-resolution: 1.5dppx), (min-width: 1600px)";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // The visitor's pause wins over autoplay, scrolling back and tab changes.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Force DOM properties and attributes required by Safari / WebKit for autoplay
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");

    const markReady = () => setReady(true);

    const playVideo = () => {
      if (pausedRef.current) return;
      video.muted = true;
      const promise = video.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            markReady();
          })
          .catch(() => {
            // If browser autoplay policy defers playback until gesture,
            // we will catch it in the interaction listeners below
          });
      }
    };

    // Attempt playback immediately
    playVideo();

    video.addEventListener("loadeddata", playVideo);
    video.addEventListener("canplay", playVideo);
    video.addEventListener("playing", markReady);
    video.addEventListener("timeupdate", () => {
      if (video.currentTime > 0) markReady();
    });

    // Touch, click or scroll unlocks playback if browser temporarily deferred autoplay
    const unlockInteraction = () => {
      playVideo();
    };

    window.addEventListener("touchstart", unlockInteraction, {
      passive: true,
      once: true,
    });
    window.addEventListener("click", unlockInteraction, {
      passive: true,
      once: true,
    });
    window.addEventListener("scroll", unlockInteraction, {
      passive: true,
      once: true,
    });

    let isVisible = true;
    const syncVisibility = () => {
      if (!isVisible || document.hidden || pausedRef.current) {
        video.pause();
      } else {
        playVideo();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? true;
        syncVisibility();
      },
      { threshold: 0.05 },
    );

    observer.observe(video);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("touchstart", unlockInteraction);
      window.removeEventListener("click", unlockInteraction);
      window.removeEventListener("scroll", unlockInteraction);
      video.removeEventListener("loadeddata", playVideo);
      video.removeEventListener("canplay", playVideo);
      video.removeEventListener("playing", markReady);
      video.pause();
    };
  }, []);

  const togglePause = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      video.pause();
    } else {
      video.muted = true;
      video.play().catch(() => {});
    }
  };

  return (
    <div className="hero-media">
      <div className="hero-stage">
        {/* biome-ignore lint/performance/noImgElement: Local preoptimized poster, also shared with the video element. */}
        <img
          src="/media/landing/hero-kardo-poster.webp"
          srcSet="/media/landing/hero-kardo-poster-960.webp 960w, /media/landing/hero-kardo-poster.webp 1920w, /media/landing/hero-kardo-poster-2560.webp 2560w"
          sizes="100vw"
          alt="Stand de muestra de Kardo sobre el mostrador de una tienda, con el logo de Kardo, un código QR y el símbolo para acercar el celular"
          width="1920"
          height="1080"
          fetchPriority="high"
        />
        <video
          ref={videoRef}
          className={ready ? "is-ready" : ""}
          autoPlay
          muted
          playsInline
          loop
          preload="metadata"
          poster="/media/landing/hero-kardo-poster.webp"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          onPlaying={() => setReady(true)}
        >
          {/* scripts/media/hero-video.py --pingpong: the Higgsfield clip
              (MiniMax H3, 2K, no people, leaf shadows over the counter) played
              forward and back, with the clean stand on every frame. 2560 × 1440
              for retina desktops and wide screens, 1920 × 1080 for everything
              else (a browser that ignores `media` takes the first source it
              can play). */}
          <source
            media={wideHero}
            src="/media/landing/hero-kardo-1440.webm"
            type="video/webm"
          />
          <source
            media={wideHero}
            src="/media/landing/hero-kardo-1440.mp4"
            type="video/mp4"
          />
          <source src="/media/landing/hero-kardo.webm" type="video/webm" />
          <source src="/media/landing/hero-kardo.mp4" type="video/mp4" />
        </video>
      </div>
      {ready ? (
        <button
          className="hero-pause"
          type="button"
          onClick={togglePause}
          aria-label={paused ? "Reproducir el video" : "Pausar el video"}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
            {paused ? (
              <path d="M5 3.2v9.6a.6.6 0 0 0 .92.5l7.2-4.8a.6.6 0 0 0 0-1L5.92 2.7A.6.6 0 0 0 5 3.2Z" />
            ) : (
              <path d="M4.5 3h2.2v10H4.5zM9.3 3h2.2v10H9.3z" />
            )}
          </svg>
        </button>
      ) : null}
    </div>
  );
}
