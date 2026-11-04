import "@/styles/globals.css";
import "@/components/StaggeredMenu.css";
import "@/styles/index.css";
import "@/styles/chat.css";
import "@/styles/stats.css";
import "@/styles/auth.css";
import "@/styles/knowledge-base.css";
import "@/styles/pillnav.css";
import "@/styles/history.css";
import "@/styles/account.css";
import "@/styles/mobile-nav.css";
import "@/styles/adaptive-persona.css";
import "@/styles/language-switcher.css";
import "@/i18n";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import MobileNav from "@/components/MobileNav";
import { useRouter } from "next/router";
import LanguageSync from "@/components/LanguageSync";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isChatScreen = router.pathname === '/screens/chat';

  return (
    <ThemeProvider>
      <AuthProvider>
        <Component {...pageProps} />
        {!isChatScreen && <MobileNav />}
        <LanguageSync />
        <LanguageSwitcher avoidTopRight={isChatScreen} />
      </AuthProvider>
    </ThemeProvider>
  );
}
