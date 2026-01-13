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
          background: '#1F7A4A',
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
