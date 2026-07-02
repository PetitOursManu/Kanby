"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

/**
 * Fires a confetti burst and an animated check mark. Call `fire()` after a
 * successful drop into a DONE column. Renders nothing visible between fires.
 */
export function ConfettiOnDoneDrop() {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    let mounted = true;
    function onCelebrate() {
      // Particle burst from the top-center.
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 38,
        origin: { y: 0.7 },
        colors: ["#7dd3fc", "#c8a0f0", "#88b4cc", "#10b981", "#f59e0b"],
        disableForReducedMotion: true,
      });
      if (!mounted) return;
      setShowCheck(true);
      setTimeout(() => mounted && setShowCheck(false), 1400);
    }
    window.addEventListener("kanby:celebrate", onCelebrate as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("kanby:celebrate", onCelebrate as EventListener);
    };
  }, []);

  return (
    <AnimatePresence>
      {showCheck && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="pointer-events-none fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2"
        >
          <svg width="72" height="72" viewBox="0 0 52 52">
            <motion.circle
              cx="26" cy="26" r="24" fill="#10b981"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
            />
            <motion.path
              d="M14 27l8 8l16 -16"
              fill="none"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Helper to trigger the celebration from anywhere. */
export function celebrateDoneDrop() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("kanby:celebrate"));
  }
}