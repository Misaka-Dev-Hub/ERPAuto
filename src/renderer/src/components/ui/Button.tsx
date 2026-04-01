import * as React from 'react'
import { Button as ShadcnButton } from './button'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}

const variantMap: Record<ButtonVariant, 'default' | 'secondary' | 'destructive' | 'ghost'> = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  ghost: 'ghost'
}

const sizeMap: Record<ButtonSize, 'default' | 'sm' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, children, disabled, className, ...props }, ref) => {
    return (
      <ShadcnButton
        ref={ref}
        variant={variantMap[variant]}
        size={sizeMap[size]}
        disabled={disabled || loading}
        className={className}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {icon && !loading && <span className="mr-2">{icon}</span>}
        {children}
      </ShadcnButton>
    )
  }
)

Button.displayName = 'Button'

export default Button
