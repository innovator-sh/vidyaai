import "@/styles/globals.css";
import "@/components/StaggeredMenu.css";
import "@/styles/index.css";
import "@/styles/chat.css";
import "@/styles/stats.css";
import "@/styles/auth.css";
import "@/styles/pillnav.css";
import "@/styles/history.css";
import "@/styles/account.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}

