import { ImageResponse } from 'next/og';

// Generate a square icon to ensure proper aspect ratio
export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default async function Icon() {
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
      ...size,
    }
  );
}
