import './globals.css';

export const metadata = {
  title: 'Pulau Kabut',
  description:
    'Open world low-poly: jelajahi pulau berkabut, kumpulkan kristal cahaya, meluncur di antara lembah.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#08131a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
