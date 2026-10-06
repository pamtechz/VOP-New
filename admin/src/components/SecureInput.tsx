import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface SecureInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  isFinancial?: boolean;
}

export const SecureInput: React.FC<SecureInputProps> = ({
  label,
  isFinancial = false,
  type = 'password',
  className = '',
  ...props
}) => {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          {label}
          {isFinancial && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" /> Protected Field
            </span>
          )}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          {...props}
          type={showValue ? 'text' : type}
          autoComplete={isFinancial ? 'off' : 'new-password'}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-private="true"
          data-sensitive="true"
          className={`w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all font-mono tracking-wide ${className}`}
        />

        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-3 text-slate-400 hover:text-slate-200 focus:outline-none p-1"
            tabIndex={-1}
            aria-label={showValue ? 'Hide value' : 'Show value'}
          >
            {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};
