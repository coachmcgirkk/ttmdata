import React from "react";
import { HOURLY_AGAINST_DASHARRAY, hourlyGroupIsDashed } from "../hourlyDirection";

function StrokeSample({ dashed, color }) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      <line
        x1="1"
        y1="5"
        x2="27"
        y2="5"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dashed ? HOURLY_AGAINST_DASHARRAY : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function HourlyDirectionStrokeLegend({ groups, darkMode }) {
  if (!groups || groups.length < 2) return null;
  const color = darkMode ? "#e2e8f0" : "#334155";
  return (
    <div className="hourly-direction-stroke-legend" aria-label="Direction line style">
      <span className="hourly-direction-stroke-legend-title">Line style</span>
      {groups.map(group => (
        <span key={group.id} className="hourly-direction-stroke-legend-item">
          <StrokeSample dashed={hourlyGroupIsDashed(group)} color={color} />
          {group.label}
        </span>
      ))}
    </div>
  );
}

export default HourlyDirectionStrokeLegend;
