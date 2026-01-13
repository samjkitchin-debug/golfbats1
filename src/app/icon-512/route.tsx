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
            fontSize: 300,
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
