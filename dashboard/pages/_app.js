import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export default function App({ Component, pageProps }) {
  return (
    <div className={`${inter.variable} ${mono.variable} font-sans`}>
      <Component {...pageProps} />
    </div>
  );
}
