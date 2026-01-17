import { ImageResponse } from 'next/og';

// Generate 512x512 square icon for PWA
export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const iconUrl = `${baseUrl}/brand/logo-mark.png`;

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
        <img
          src={iconUrl}
          alt="DayForeIt"
          style={{
            width: '76%',
            height: '76%',
            objectFit: 'contain',
          }}
        />
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
