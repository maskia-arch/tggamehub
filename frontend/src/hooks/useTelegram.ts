import { useEffect, useState } from 'react';

export interface TelegramUser {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

function checkIsInsideTelegram(): boolean {
  if (typeof window === 'undefined') return false;
  const webapp = (window as any).Telegram?.WebApp;
  const hasInitData = Boolean(webapp && webapp.initData && webapp.initData.length > 0);
  if (hasInitData) return true;

  const isLocalDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.search.includes('dev=true');

  return isLocalDev;
}

export function useTelegram() {
  const [tg, setTg] = useState<any>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>('');
  const [isInsideTelegram, setIsInsideTelegram] = useState<boolean>(checkIsInsideTelegram());

  useEffect(() => {
    const webapp = (window as any).Telegram?.WebApp;
    const hasInitData = Boolean(webapp && webapp.initData && webapp.initData.length > 0);

    const isLocalDev =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.search.includes('dev=true'));

    if (hasInitData) {
      webapp.ready();
      webapp.expand();

      if (webapp.setHeaderColor) {
        webapp.setHeaderColor('bg_color');
      }

      setTg(webapp);

      const tgUser = webapp.initDataUnsafe?.user;
      if (tgUser) {
        setUser({
          id: tgUser.id.toString(),
          username: tgUser.username,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
        });
      }
      setInitData(webapp.initData);
      setIsInsideTelegram(true);
    } else if (isLocalDev) {
      // Local development simulation with fixed profile
      console.log('[TELEGRAM SDK]: Running in local dev environment. Emulating fixed developer context.');

      const devId = localStorage.getItem('coincade_dev_id') || '999999';
      localStorage.setItem('coincade_dev_id', devId);

      setUser({
        id: devId,
        username: 'coincade_dev',
        first_name: 'CoinCade',
        last_name: 'Dev',
      });
      setInitData(`dev_${devId}`);
      setIsInsideTelegram(true);
    } else {
      // Accessed directly via web browser on production domain
      console.log('[TELEGRAM SDK]: Direct browser access detected outside Telegram.');
      setIsInsideTelegram(false);
    }
  }, []);

  return {
    tg,
    user,
    initData,
    isInsideTelegram,
  };
}

