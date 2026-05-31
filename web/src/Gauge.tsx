interface GaugeProps {
  value: number;
  color: string;
  grade: string;
  label: string;
}

const SIZE = 300;
const STROKE = 20;
const R = (SIZE - STROKE) / 2 - 10;
const CX = SIZE / 2;
const CY = SIZE / 2;
const C = 2 * Math.PI * R;
const ARC = 0.75; // 270 degrees, open at the bottom like a dial

export function Gauge({ value, color, grade, label }: GaugeProps) {
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const trackLen = C * ARC;
  const valueLen = trackLen * pct;
  const rounded = Math.round(value);

  return (
    <div className="gauge" style={{ ["--signal" as string]: color }}>
      <div className="gauge-glow" aria-hidden="true" />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Tracking health score ${rounded} out of 100, grade ${grade}`}
      >
        <g transform={`rotate(135 ${CX} ${CY})`}>
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="var(--track)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${trackLen} ${C}`}
          />
          <circle
            className="gauge-value"
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${valueLen} ${C}`}
          />
          {/* ticks */}
          {Array.from({ length: 11 }).map((_, i) => {
            const a = (i / 10) * ARC * 360 * (Math.PI / 180);
            const r1 = R - STROKE / 2 - 6;
            const r2 = R - STROKE / 2 - 12;
            return (
              <line
                key={i}
                x1={CX + r1 * Math.cos(a)}
                y1={CY + r1 * Math.sin(a)}
                x2={CX + r2 * Math.cos(a)}
                y2={CY + r2 * Math.sin(a)}
                stroke="var(--tick)"
                strokeWidth={2}
              />
            );
          })}
        </g>
      </svg>
      <div className="gauge-readout">
        <div className="gauge-score" style={{ color }}>
          {rounded}
          <span className="gauge-max">/100</span>
        </div>
        <div className="gauge-grade" style={{ color }}>
          Grade {grade}
        </div>
        <div className="gauge-label">{label}</div>
      </div>
    </div>
  );
}
