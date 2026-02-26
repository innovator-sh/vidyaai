import "@/styles/globals.css";
import "@/components/StaggeredMenu.css";
import "@/styles/index.css";
import "@/styles/chat.css";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

import "@/styles/stats.css";
