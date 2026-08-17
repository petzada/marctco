/**
 * Small inline SVGs for the Leads screen. Hand-rolled rather than a new icon
 * package dependency — this is the first ticket standing up `apps/web`'s
 * component layer, and a handful of 16–20px glyphs does not earn a new
 * dependency (`package.json` changes are this ticket's alone to make, and
 * this keeps that change to `nuqs`).
 */

interface IconProps {
  readonly className?: string;
}

export function PhoneOffIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path
        d="M10.5 5.5 8.8 4a1 1 0 0 0-1.5.14L5.7 6.3a1 1 0 0 0-.07 1.1c.6 1.1 1.4 2.2 2.4 3.3M13.9 14.1c1.1 1 2.2 1.8 3.3 2.4a1 1 0 0 0 1.1-.07l2.16-1.6a1 1 0 0 0 .14-1.5l-1.5-1.7m-.3 6.65C13.4 20 8.6 16.9 4.7 12.9M3 3l18 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserQuestionIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M4 20c0-3.3 3.6-5 8-5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M16.5 10.8c0-1 .8-1.6 1.7-1.6s1.7.6 1.7 1.5c0 .8-.5 1.1-1.1 1.5-.5.3-.6.5-.6 1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.15" cy="16.6" fill="currentColor" r="0.6" stroke="none" />
    </svg>
  );
}

export function CopyWarningIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <rect height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" width="12" x="8" y="8" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path
        d="M12 3.5 21 19.5H3L12 3.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16.6" fill="currentColor" r="0.6" stroke="none" />
    </svg>
  );
}

export function PencilIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path
        d="m16.5 4.5 3 3L8 19H5v-3L16.5 4.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M5 5l14 14M19 5 5 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarkerIcon({ icon, className = "h-4 w-4" }: IconProps & { readonly icon: "phone-off" | "user-question" | "copy" | "clock" }) {
  switch (icon) {
    case "phone-off":
      return <PhoneOffIcon className={className} />;
    case "user-question":
      return <UserQuestionIcon className={className} />;
    case "copy":
      return <CopyWarningIcon className={className} />;
    case "clock":
      return <ClockIcon className={className} />;
    default: {
      const unhandled: never = icon;
      throw new Error(`Unhandled marker icon: ${JSON.stringify(unhandled)}`);
    }
  }
}
