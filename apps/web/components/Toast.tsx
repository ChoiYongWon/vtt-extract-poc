"use client";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast" onClick={onDismiss}>
      <span className="toast-icon">✓</span>
      {message}
    </div>
  );
}
