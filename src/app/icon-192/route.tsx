import { ImageResponse } from 'next/og';

// Generate 192x192 square icon for PWA
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF7F0',
        }}
      >
        <div
          style={{
            width: '90%',
            height: '90%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 150,
            color: '#0B1220',
          }}
        >
          ⛳
        </div>
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
