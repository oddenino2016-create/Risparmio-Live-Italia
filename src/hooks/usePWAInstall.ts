import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface RelatedApplication {
  id?: string;
  platform?: string;
  url?: string;
}

const INSTALLED_STORAGE_KEY = 'risparmio_pwa_installed';

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (checkStandaloneMode()) return true;
    try {
      return window.localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsAndroid(/android/.test(ua));
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    if (checkStandaloneMode()) {
      setIsInstalled(true);
    }

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    media.addEventListener?.('change', onDisplayChange);

    // Query Chrome's getInstalledRelatedApps when available on Android
    const navWithRelated = window.navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<RelatedApplication[]>;
    };
    if (typeof navWithRelated.getInstalledRelatedApps === 'function') {
      navWithRelated
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsInstalled(true);
            try {
              window.localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
            } catch {
              // Ignore storage quota errors
            }
          }
        })
        .catch(() => {});
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Browser re-offered install (e.g. app was uninstalled), so show the button again
      try {
        window.localStorage.removeItem(INSTALLED_STORAGE_KEY);
      } catch {
        // Ignore
      }
      setIsInstalled(false);
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        window.localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      } catch {
        // Ignore
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      media.removeEventListener?.('change', onDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        window.localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      } catch {
        // Ignore
      }
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isAndroid,
    isIOS,
    install,
  };
}
