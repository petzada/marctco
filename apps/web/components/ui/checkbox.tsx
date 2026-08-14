import type { InputHTMLAttributes } from "react";

export function Checkbox({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-focus min-[769px]:min-h-9 min-[769px]:min-w-9">
      <input className={`peer h-4 w-4 appearance-none rounded-xs border border-hairline-strong bg-canvas checked:border-transparent checked:bg-primary ${className}`.trim()} type="checkbox" {...props} />
      <svg aria-hidden="true" className="pointer-events-none absolute h-3 w-3 text-on-primary opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
        <path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
