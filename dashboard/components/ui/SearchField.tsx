"use client";

/* Adapted from Beautiful UI's SearchList demo (MIT, © 2026 Shane Levine).
 * Same field markup and tokens; driven by props instead of demo items. */

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
};

export function SearchField({ value, onChange, placeholder, ariaLabel }: SearchFieldProps) {
  return (
    <div className="w-full overflow-hidden rounded-control bg-surface shadow-btn">
      <div className="flex h-9 items-center gap-2 px-3 transition-colors duration-100 hover:bg-hover">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        {value && (
          <button
            aria-label="Clear search"
            type="button"
            onClick={() => onChange("")}
            className="flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink"
            style={{ animation: "fade-in 150ms ease-out both" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
