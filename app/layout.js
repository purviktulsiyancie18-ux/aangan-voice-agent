import './globals.css';

export const metadata = {
  title: 'Aangan Calls',
  description: 'Aangan Studio phone enquiry agent — calls, outcomes, bookings and running cost',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
