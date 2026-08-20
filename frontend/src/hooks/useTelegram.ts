import { useEffect, useState } from 'react';

export interface TelegramUser {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export function useTelegram() {
  const [tg, setTg] = useState<any>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>('');

  useEffect(() => {
    const webapp = (window as any).Telegram?.WebApp;
    if (webapp && webapp.initData) {
      webapp.ready();
      webapp.expand();
      
      // Match theme colors with Telegram's styling if desired
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
    } else {
      // Browser fallback (Developer simulation)
      console.log('[TELEGRAM SDK]: Running outside Telegram client. Emulating developer context.');
      
      // Generate a persistent dev user ID locally for easy testing
      let devId = localStorage.getItem('tggamehub_dev_id');
      if (!devId) {
        devId = Math.floor(100000 + Math.random() * 900000).toString();
        localStorage.setItem('tggamehub_dev_id', devId);
      }

      setUser({
        id: devId,
        username: `dev_gamer_${devId}`,
        first_name: 'Developer',
        last_name: `Gamer #${devId}`,
      });
      setInitData(`dev_${devId}`);
    }
  }, []);

  return {
    tg,
    user,
    initData,
  };
}
