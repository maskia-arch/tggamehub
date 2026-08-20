import React, { useState } from 'react';
import { Gamepad2, Send, ExternalLink, ShieldCheck, Trophy, Sparkles, Globe } from 'lucide-react';

interface TelegramRedirectLandingProps {
  botUsername?: string;
}

export const TelegramRedirectLanding: React.FC<TelegramRedirectLandingProps> = ({
  botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string) || 'tggamehub_bot',
}) => {
  const [lang, setLang] = useState<'de' | 'en'>('de');
  const botUrl = `https://t.me/${botUsername}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-cyan-500 selection:text-black">
      {/* Background Neon Grid & Glow Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Top Glow Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500" />

        {/* Language Selector Switch */}
        <div className="flex justify-between items-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 text-xs font-semibold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Telegram Mini App
          </div>

          <div className="flex items-center bg-slate-800/80 p-1 rounded-full border border-slate-700">
            <Globe size={14} className="text-slate-400 ml-2 mr-1" />
            <button
              onClick={() => setLang('de')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                lang === 'de'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              DE
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                lang === 'en'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Main Logo & Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/25 mb-4 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Gamepad2 size={40} className="text-cyan-400 animate-bounce" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
            TG Game Hub <Sparkles size={22} className="text-amber-400" />
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Arcade Gaming & Real Crypto Airdrops
          </p>
        </div>

        {/* German Content */}
        {lang === 'de' && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-left">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Send size={18} className="text-cyan-400" />
                Spielstart im Telegram Bot erforderlich
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Diese Web-App ist eine offizielle <strong>Telegram Mini App</strong>.
                Um deinen Spielfortschritt zu speichern, im Börsenmarkt zu traden und echte
                Krypto-Gewinne im Season-Airdrop zu erhalten, starte das Spiel bitte direkt über unseren Telegram Bot.
              </p>
            </div>

            {/* Quick 3-Step Guide */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400 py-1">
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">1</span>
                Bot öffnen
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">2</span>
                Start drücken
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">3</span>
                Spielen & Win
              </div>
            </div>

            {/* Action CTA Button */}
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2.5 w-full py-4 px-6 rounded-2xl font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 shadow-xl shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-base"
            >
              <Send size={20} className="transition-transform group-hover:rotate-12" />
              <span>Im Telegram Bot öffnen</span>
              <ExternalLink size={18} className="opacity-75" />
            </a>

            <p className="text-center text-xs text-slate-500 pt-1">
              Direktlink: <span className="text-cyan-400 font-mono">@{botUsername}</span>
            </p>
          </div>
        )}

        {/* English Content */}
        {lang === 'en' && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-left">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Send size={18} className="text-cyan-400" />
                Launch inside Telegram Bot required
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                This web application runs as an official <strong>Telegram Mini App</strong>.
                To record highscores, trade on the marketplace, and participate in verified
                crypto season airdrops, please launch the game directly via our Telegram Bot.
              </p>
            </div>

            {/* Quick 3-Step Guide */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400 py-1">
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">1</span>
                Open Bot
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">2</span>
                Press Start
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <span className="block font-bold text-cyan-400 text-sm mb-0.5">3</span>
                Play & Earn
              </div>
            </div>

            {/* Action CTA Button */}
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2.5 w-full py-4 px-6 rounded-2xl font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 shadow-xl shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-base"
            >
              <Send size={20} className="transition-transform group-hover:rotate-12" />
              <span>Launch in Telegram Bot</span>
              <ExternalLink size={18} className="opacity-75" />
            </a>

            <p className="text-center text-xs text-slate-500 pt-1">
              Direct Bot link: <span className="text-cyan-400 font-mono">@{botUsername}</span>
            </p>
          </div>
        )}

        {/* Feature Badges Footer */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-around text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Trophy size={14} className="text-amber-400" />
            <span>Leaderboards</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Fair Gaming</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-cyan-400" />
            <span>LTC / BTC Payouts</span>
          </div>
        </div>
      </div>
    </div>
  );
};
