import { ImageResponse } from 'next/og';

// Generate 512x512 square icon for PWA
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
            fontSize: 300,
            color: '#0B1220',
          }}
        >
          ⛳
        </div>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
