/**
 * Marquee — smooth scrolling text for long song/artist names
 */
import { useRef, useEffect, useState } from "react";

export default function Marquee({ text, className = "", speed = 40 }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !textRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const textW = textRef.current.scrollWidth;
    setShouldScroll(textW > containerW);
  }, [text]);

  if (!shouldScroll) {
    return (
      <span ref={containerRef} className={`block overflow-hidden whitespace-nowrap ${className}`}>
        <span ref={textRef}>{text}</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div
        className="inline-flex"
        style={{
          animation: `marquee ${text.length * 0.25}s linear infinite`,
          animationPlayState: "running",
        }}
      >
        <span ref={textRef} className="pr-16">{text}</span>
        <span className="pr-16">{text}</span>
      </div>
    </div>
  );
}
