interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, disabled = false, size = "md" }: ToggleProps) {
  const dims = size === "sm" ? "w-8 h-[18px]" : "w-11 h-6";
  const dot = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  const translate = size === "sm" ? "translate-x-3.5" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex shrink-0 cursor-pointer items-center rounded-full
        transition-colors duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${dims}
        ${checked ? "bg-brand-600" : "bg-gray-300"}
      `}
    >
      <span
        className={`
          inline-block rounded-full bg-white shadow-sm
          transform transition-transform duration-200 ease-in-out
          ${dot}
          ${checked ? translate : "translate-x-0.5"}
        `}
      />
    </button>
  );
}
