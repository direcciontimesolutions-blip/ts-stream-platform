import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C0C14',
          borderRadius: 6,
        }}
      >
        <svg
          width="18"
          height="22"
          viewBox="0 0 18 22"
          fill="none"
        >
          {/* Top bar */}
          <rect x="0" y="0" width="18" height="2.5" rx="1.25" fill="#7B2FBE" />
          {/* Top bowl */}
          <path d="M1.5 2.5 L16.5 2.5 L10.2 10 L7.8 10 Z" fill="#7B2FBE" />
          {/* Neck teal */}
          <rect x="7.2" y="10" width="3.6" height="2" rx="0.5" fill="#00E8BE" />
          {/* Bottom bowl */}
          <path d="M7.8 12 L10.2 12 L16.5 19.5 L1.5 19.5 Z" fill="#7B2FBE" />
          {/* Bottom bar */}
          <rect x="0" y="19.5" width="18" height="2.5" rx="1.25" fill="#7B2FBE" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
