import React from "react";

function HourlyDirectionToggle({ options, value, onChange }) {
  if (!options?.length) return null;
  return (
    <div className="hourly-seg" role="group" aria-label="Travel direction">
      {options.map(option => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`hourly-seg-btn${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default HourlyDirectionToggle;
