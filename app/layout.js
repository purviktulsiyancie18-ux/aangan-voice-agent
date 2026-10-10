import { Source_Serif_4, Manrope } from 'next/font/google';
import './globals.css';

const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--ff-serif', display: 'swap' });
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--ff-sans', display: 'swap' });

export const metadata = {
  title: 'Aangan Calls',
  description: 'Aangan Studio phone enquiry agent — calls, outcomes, bookings and running cost',
};

// Apply the saved theme before first paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem('aangan-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
