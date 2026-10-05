import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Member } from '@/types/chit';

interface SpinWheelProps {
  members: Member[];
  winner: Member | null;
  isSpinning: boolean;
  onSpinComplete: () => void;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 70%, 55%)',
  'hsl(340, 70%, 55%)',
  'hsl(160, 70%, 45%)',
  'hsl(45, 90%, 50%)',
  'hsl(280, 60%, 55%)',
];

export function SpinWheel({ members, winner, isSpinning, onSpinComplete }: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const wheelRef = useRef<SVGSVGElement>(null);

  const segmentAngle = 360 / members.length;

  useEffect(() => {
    if (isSpinning && winner) {
      const winnerIndex = members.findIndex(m => m.id === winner.id);
      // Calculate rotation to land on winner (pointer at top)
      const targetAngle = 360 - (winnerIndex * segmentAngle + segmentAngle / 2);
      // Add multiple full rotations for effect
      const fullRotations = 5 + Math.random() * 3;
      const finalRotation = rotation + (fullRotations * 360) + targetAngle;
      
      setRotation(finalRotation);
      
      // Keep the result accessible without forcing users who prefer reduced motion
      // to wait through the full visual animation.
      const completionDelay = prefersReducedMotion ? 0 : 4000;
      const timer = window.setTimeout(onSpinComplete, completionDelay);
      return () => window.clearTimeout(timer);
    }
  }, [isSpinning, winner]);

  const getSegmentPath = (index: number): string => {
    const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
    const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);
    const radius = 150;
    const cx = 175;
    const cy = 175;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = segmentAngle > 180 ? 1 : 0;

    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  const getTextPosition = (index: number): { x: number; y: number; angle: number } => {
    const midAngle = ((index + 0.5) * segmentAngle - 90) * (Math.PI / 180);
    const radius = 100;
    const cx = 175;
    const cy = 175;

    return {
      x: cx + radius * Math.cos(midAngle),
      y: cy + radius * Math.sin(midAngle),
      angle: (index + 0.5) * segmentAngle
    };
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* Pointer */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
        <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[25px] border-t-primary" />
      </div>

      <motion.svg
        ref={wheelRef}
        width="350"
        height="350"
        viewBox="0 0 350 350"
        animate={{ rotate: rotation }}
        transition={{ 
          duration: prefersReducedMotion ? 0 : 4, 
          ease: [0.2, 0.8, 0.2, 1] 
        }}
        className="drop-shadow-2xl"
        aria-hidden="true"
      >
        {/* Outer ring */}
        <circle cx="175" cy="175" r="165" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        
        {/* Segments */}
        {members.map((member, index) => {
          const textPos = getTextPosition(index);
          const displayName = member.name.length > 10 
            ? member.name.substring(0, 10) + '...' 
            : member.name;
          
          return (
            <g key={member.id}>
              <path
                d={getSegmentPath(index)}
                fill={COLORS[index % COLORS.length]}
                stroke="hsl(var(--background))"
                strokeWidth="2"
              />
              <text
                x={textPos.x}
                y={textPos.y}
                fill="white"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${textPos.angle}, ${textPos.x}, ${textPos.y})`}
                className="drop-shadow-sm"
              >
                {displayName}
              </text>
            </g>
          );
        })}

        {/* Center circle */}
        <circle cx="175" cy="175" r="25" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="3" />
        <circle cx="175" cy="175" r="15" fill="hsl(var(--primary))" />
      </motion.svg>
    </div>
  );
}
