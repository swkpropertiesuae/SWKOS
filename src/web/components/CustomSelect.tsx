import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { List, Pencil, X } from 'lucide-react'
import { cls } from '../lib/format'

const CUSTOM_SENTINEL = '__SWK_CUSTOM__'

export interface CustomSelectOption {
  value: string
  label: string
  disabled?: boolean
}

type LayoutSplit = { wrapper: string; control: string }

const WRAPPER_TOKEN_RE = /^(?:(?:sm|md|lg|xl|2xl):)?(?:col-span-|row-span-|max-w-|min-w-|w-full|w-\[|w-auto|flex-1|flex-none|flex-auto|grow|shrink|self-|justify-self-|m[trblxy]?-)/

function splitClasses(className?: string): LayoutSplit {
  if (!className) return { wrapper: '', control: '' }
  const w: string[] = []
  const c: string[] = []
  for (const tok of className.split(/\s+/).filter(Boolean)) {
    if (WRAPPER_TOKEN_RE.test(tok)) w.push(tok)
    else c.push(tok)
  }
  return { wrapper: w.join(' '), control: c.join(' ') }
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement(node)) return textOf((node.props as any)?.children)
  return ''
}

function extractOptionsFromChildren(children: React.ReactNode, out: CustomSelectOption[] = []): CustomSelectOption[] {
  React.Children.forEach(children, child => {
    if (!child || typeof child !== 'object' || !React.isValidElement(child)) return
    const type = child.type
    const props: any = child.props ?? {}
    if (type === 'option') {
      const label = textOf(props.children).trim()
      const value = props.value !== undefined && props.value !== null ? String(props.value) : label
      out.push({ value, label: label || value, disabled: Boolean(props.disabled) })
    } else if (type === 'optgroup' || type === React.Fragment) {
      extractOptionsFromChildren(props.children, out)
    }
  })
  return out
}

export interface CustomSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'onBlur'> {
  options?: (string | { value: string; label?: string; disabled?: boolean })[]
  onChange?: (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => void
  onValueChange?: (value: string) => void
  onBlur?: (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) => void
  allowEmpty?: boolean
  allowCustom?: boolean
  emptyLabel?: string
  customPlaceholder?: string
  compact?: boolean
}

function makeSyntheticChange(value: string, name?: string, id?: string): React.ChangeEvent<HTMLInputElement> {
  const target = { value, name: name ?? '', id: id ?? '' } as HTMLInputElement
  return { target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>
}

/**
 * Universal drop-in replacement for `<select>` across SWK OS forms.
 * Every dropdown automatically provides:
 *  1. An explicit Empty / Clear option (so any dropdown can be emptied), AND
 *  2. A "Custom / Type your own…" option + inline pencil button that switches
 *     into a free-text input with datalist autocomplete so users can type anything
 *     even when options or search results are empty.
 */
export function CustomSelect({
  options: optionsProp,
  children,
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  className,
  style,
  disabled,
  required,
  id,
  name,
  allowEmpty = true,
  allowCustom = true,
  emptyLabel,
  customPlaceholder = 'Type custom value…',
  compact,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  title,
  ...rest
}: CustomSelectProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)

  const strVal = value !== undefined && value !== null ? String(value) : ''

  const parsedOptions = useMemo<CustomSelectOption[]>(() => {
    if (optionsProp) {
      return optionsProp.map(o =>
        typeof o === 'string'
          ? { value: o, label: o }
          : { value: String(o.value), label: o.label ?? String(o.value), disabled: o.disabled },
      )
    }
    return extractOptionsFromChildren(children)
  }, [optionsProp, children])

  const hasEmptyOption = useMemo(() => parsedOptions.some(o => o.value === ''), [parsedOptions])
  const knownValues = useMemo(() => new Set(parsedOptions.map(o => o.value)), [parsedOptions])
  const isCustomValue = strVal !== '' && !knownValues.has(strVal)

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [editing])

  const emit = (nextVal: string, nativeEvent?: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    if (onChange) {
      onChange(nativeEvent ?? makeSyntheticChange(nextVal, name, id))
    }
    onValueChange?.(nextVal)
  }

  const { wrapper: wrapperCls, control: controlCls } = splitClasses(className)
  const wrapperStyle: React.CSSProperties | undefined = style
    ? {
        width: style.width,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        flex: style.flex,
      }
    : undefined
  const innerStyle: React.CSSProperties | undefined = style
    ? {
        ...style,
        width: undefined,
        minWidth: undefined,
        maxWidth: undefined,
        flex: undefined,
      }
    : undefined

  const baseControlCls = controlCls || 'select'
  const inputControlCls = baseControlCls.replace(/\bselect\b/g, 'input') || 'input'

  if (editing && allowCustom && !disabled) {
    return (
      <div className={cls('swk-custom-select is-editing', compact && 'compact', wrapperCls)} style={wrapperStyle}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          list={listId}
          className={cls(inputControlCls, 'swk-custom-select-control')}
          style={innerStyle}
          value={strVal}
          required={required}
          disabled={disabled}
          placeholder={customPlaceholder}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          title={title}
          onChange={e => emit(e.target.value, e)}
          onKeyDown={e => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          onBlur={e => {
            onBlur?.(e)
          }}
        />
        <datalist id={listId}>
          {parsedOptions.filter(o => o.value !== '' && !o.disabled).map(o => (
            <option key={o.value} value={o.value}>{o.label !== o.value ? o.label : undefined}</option>
          ))}
        </datalist>
        {allowEmpty && strVal !== '' && (
          <button
            type="button"
            className="swk-custom-select-btn"
            title="Clear / Empty"
            aria-label="Clear value"
            onMouseDown={e => e.preventDefault()}
            onClick={() => emit('')}
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className="swk-custom-select-btn"
          title="Back to dropdown options"
          aria-label="Back to dropdown options"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setEditing(false)}
        >
          <List size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className={cls('swk-custom-select', compact && 'compact', wrapperCls)} style={wrapperStyle}>
      <select
        {...rest}
        id={id}
        name={name}
        className={cls(baseControlCls, 'swk-custom-select-control')}
        style={innerStyle}
        value={value !== undefined ? strVal : undefined}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        title={title}
        onBlur={onBlur as any}
        onChange={e => {
          if (e.target.value === CUSTOM_SENTINEL) {
            setEditing(true)
            return
          }
          emit(e.target.value, e)
        }}
      >
        {allowEmpty && !hasEmptyOption && (
          <option value="">{emptyLabel ?? (required ? 'Select or type custom…' : '— Empty —')}</option>
        )}
        {optionsProp
          ? parsedOptions.map(o => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
        {isCustomValue && (
          <option value={strVal}>{strVal} (Custom)</option>
        )}
        {allowCustom && !disabled && (
          <option value={CUSTOM_SENTINEL}>✎ Custom / Type your own…</option>
        )}
      </select>
      {allowCustom && !disabled && (
        <button
          type="button"
          className="swk-custom-select-btn"
          title="Empty / Type custom value"
          aria-label={ariaLabel ? `Type custom ${ariaLabel}` : 'Type custom value'}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setEditing(true)}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}
