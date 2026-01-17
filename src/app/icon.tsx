import { ImageResponse } from 'next/og';

// Generate a square icon to ensure proper aspect ratio
export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default async function Icon() {
  // Construct absolute URL for the icon asset
  // For production, this will use the actual site URL; for local dev, use localhost
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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
      ...size,
    }
  );
}
