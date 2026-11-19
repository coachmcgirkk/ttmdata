import React from "react";

function HourlyDirectionToggle({
  options,
  value,
  onChange,
  name = "hourly-travel-direction"
}) {
  if (!options?.length) return null;
  return (
    <div className="hourly-direction-toggle" role="radiogroup" aria-label="Travel direction">
      <span className="hourly-direction-toggle-title">Travel direction</span>
      <div className="hourly-direction-toggle-options">
        {options.map(option => (
          <label key={option.value} className="hourly-direction-option">
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default HourlyDirectionToggle;
