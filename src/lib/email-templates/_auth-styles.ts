// Shared brand styles for auth email templates.
// Body background stays #ffffff even in dark-themed apps.

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: '#111113',
  margin: 0,
  padding: 0,
}

export const container = {
  padding: '32px 28px',
  maxWidth: '560px',
  margin: '0 auto',
}

export const brand = {
  fontSize: '13px',
  fontWeight: 600 as const,
  color: '#6d5ef5',
  letterSpacing: '0.02em',
  textTransform: 'uppercase' as const,
  margin: '0 0 24px',
}

export const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#111113',
  lineHeight: 1.25,
  margin: '0 0 16px',
}

export const text = {
  fontSize: '15px',
  color: '#5b5b63',
  lineHeight: 1.6,
  margin: '0 0 20px',
}

export const link = { color: '#6d5ef5', textDecoration: 'underline' }

export const button = {
  backgroundColor: '#6d5ef5',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const codeStyle = {
  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
  fontSize: '28px',
  fontWeight: 700 as const,
  color: '#111113',
  letterSpacing: '0.15em',
  backgroundColor: '#f7f7f8',
  border: '1px solid #e5e5e8',
  borderRadius: '12px',
  padding: '16px 20px',
  display: 'inline-block',
  margin: '0 0 24px',
}

export const divider = {
  borderColor: '#e5e5e8',
  margin: '28px 0 20px',
}

export const footer = {
  fontSize: '12px',
  color: '#8e8e96',
  lineHeight: 1.5,
  margin: '20px 0 0',
}
