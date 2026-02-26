"use client";

import { useState, useEffect } from 'react';
import { cn } from '@/core/utils';
import { diceColors, type DiceType } from '@/lib/config/colors';
import type { DiceValue } from '@/features/spells/types/spells.types';
import { GlassSelector } from './glass-selector';

export interface GlassDiceSelectorProps {
  value?: DiceValue | null;
  onChange: (value: DiceValue | null) => void;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  /** Layout for the dice type selector */
  layout?: 'horizontal' | 'grid';
  /** Number of columns for grid layout */
  cols?: 1 | 2 | 3 | 4 | 6;
  /** Unique ID for Framer Motion layout animations */
  layoutId?: string;
}

const DICE_TYPES = Object.keys(diceColors) as DiceType[];

const DICE_OPTIONS = DICE_TYPES.map((type) => ({
  value: type,
  label: type,
  activeColor: diceColors[type].bg,
  textColor: diceColors[type].text,
}));

export function GlassDiceSelector({
  value,
  onChange,
  label,
  helperText,
  required = false,
  disabled = false,
  className,
  allowClear = false,
  layout = 'horizontal',
  cols,
  layoutId,
}: GlassDiceSelectorProps) {
  const [localQuantity, setLocalQuantity] = useState<string>(
    value?.quantidade?.toString() || '1'
  );
  const [localType, setLocalType] = useState<DiceType>(value?.tipo || 'd6');

  useEffect(() => {
    if (value) {
      setLocalQuantity(value.quantidade.toString());
      setLocalType(value.tipo);
    }
  }, [value]);

  const emitChange = (qty: string, type: DiceType) => {
    const qty_n = parseInt(qty, 10);
    if (!isNaN(qty_n) && qty_n > 0) {
      onChange({ quantidade: qty_n, tipo: type });
    } else if (allowClear && qty === '') {
      onChange(null);
    }
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = e.target.value.replace(/\D/g, '');
    setLocalQuantity(masked);
    emitChange(masked, localType);
  };

  const handleClear = () => {
    setLocalQuantity('1');
    setLocalType('d6');
    onChange(null);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label className="text-sm font-medium text-white/90">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      <div className="flex items-center gap-2">
        {/* Quantity — numeric text input */}
        <input
          type="text"
          inputMode="numeric"
          value={localQuantity}
          onChange={handleQuantityChange}
          disabled={disabled}
          placeholder="1"
          className={cn(
            'w-12 px-2 py-1.5 rounded-lg text-center',
            'bg-white/5 border border-white/10',
            'text-white text-sm font-medium',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors h-[38px]', // Match GlassSelector height roughly
          )}
        />

        {/* Dice Type — GlassSelector */}
        <div className="flex-1">
          <GlassSelector<DiceType>
            options={DICE_OPTIONS}
            value={localType}
            onChange={(val) => {
              const newType = Array.isArray(val) ? val[0] : val;
              setLocalType(newType);
              emitChange(localQuantity, newType);
            }}
            layout={layout}
            cols={cols}
            fullWidth
            size="md"
            disabled={disabled}
            layoutId={layoutId || `dice-selector-${label || 'default'}`}
          />
        </div>

        {/* Clear */}
        {allowClear && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'px-3 py-1.5 rounded-lg h-[38px]',
              'bg-white/5 border border-white/10',
              'text-white/70 text-xs',
              'hover:bg-white/10 hover:text-white',
              'focus:outline-none focus:ring-2 focus:ring-white/20',
              'transition-colors whitespace-nowrap',
            )}
          >
            Limpar
          </button>
        )}
      </div>

      {helperText && <p className="text-xs text-white/50">{helperText}</p>}
    </div>
  );
}

