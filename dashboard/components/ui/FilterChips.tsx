"use client";

/* Adapted from Beautiful UI's FilterTable demo (MIT, © 2026 Shane Levine).
 * Same chip row markup and tokens; options and counts come from the data. */

export type FilterOption = {
  key: string;
  label: string;
  count: number;
  dot?: string;
};

type FilterChipsProps = {
  options: FilterOption[];
  active: string;
  onChange: (key: string) => void;
};

export function FilterChips({ options, active, onChange }: FilterChipsProps) {
  return (
    <div
      className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1"
      style={{ scrollbarWidth: "none" }}
    >
      {options.map((option) => {
        const selected = option.key === active;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px]
              font-medium transition-[background-color,box-shadow,color] duration-200
              ${selected ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover"}`}
          >
            {option.dot && <span className="size-1.5 rounded-full" style={{ background: option.dot }} />}
            {option.label}
            <span
              className={`rounded-[4px] px-1 text-[10.5px] tabular-nums
                ${selected ? "bg-field text-ink-2" : "text-ink-3"}`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
