"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseTypewriterOptions {
  charsPerTick?: number;
  tickInterval?: number;
  enabled?: boolean;
  onComplete?: () => void;
}

export function useTypewriter(fullText: string, options: UseTypewriterOptions = {}) {
  const { charsPerTick = 3, tickInterval = 16, enabled = true, onComplete } = options;

  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const displayedTextRef = useRef("");

  useEffect(() => {
    displayedTextRef.current = displayedText;
  }, [displayedText]);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(fullText);
      setIsTyping(false);
      return;
    }

    const currentDisplayed = displayedTextRef.current;
    const textChanged =
      fullText.length < indexRef.current ||
      !fullText.startsWith(currentDisplayed.slice(0, Math.min(currentDisplayed.length, 50)));

    if (textChanged) {
      indexRef.current = 0;
      setDisplayedText("");
    }

    if (indexRef.current < fullText.length) {
      setIsTyping(true);
    }
  }, [fullText, enabled]);

  useEffect(() => {
    if (!enabled || !isTyping) return;

    const tick = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= tickInterval) {
        lastTickRef.current = timestamp;

        if (indexRef.current < fullText.length) {
          const nextIndex = Math.min(indexRef.current + charsPerTick, fullText.length);
          indexRef.current = nextIndex;
          setDisplayedText(fullText.slice(0, nextIndex));
        } else {
          setIsTyping(false);
          onComplete?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [fullText, enabled, isTyping, charsPerTick, tickInterval, onComplete]);

  const skipToEnd = useCallback(() => {
    indexRef.current = fullText.length;
    setDisplayedText(fullText);
    setIsTyping(false);
  }, [fullText]);

  return {
    displayedText,
    isTyping,
    skipToEnd,
    progress: fullText.length > 0 ? indexRef.current / fullText.length : 1,
  };
}
